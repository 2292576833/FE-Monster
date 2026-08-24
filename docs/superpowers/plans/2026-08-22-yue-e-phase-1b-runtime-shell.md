# 遇E 第 1 阶段 1B：批准资产提升与运行时壳 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 只在用户通过 Gate A 后，把获批的遇E旅人字节安全提升为内容寻址运行资产，并交付可取消、可恢复、只占用一个重型 RAF 所有权的空音乐区 Three.js 运行时壳。

**Architecture:** 资产发布使用不可变内容寻址 GLB 加单一 manifest 原子提交点；浏览器运行时由小型 ESM 模块组成，所有平台能力通过窄接口注入。运行时用纯生命周期机、规格 v2 快照、连续三帧门和同实例 context 恢复组合资源；`HeavyRafCoordinator` 在基础场景 RAF 全部停稳后才授予遇E租约，因此预载保持原页面可用，而首帧审计、进入、活动、退出和恢复始终不会并跑两个重型渲染循环。

**Tech Stack:** Node.js 24、`node:test`、浏览器 Three.js/GLTFLoader r128、npm Three.js 0.185.1 结构测试、原生 ESM、Web Crypto SHA-256、AbortController、手写 fake RAF/EventTarget/TimerPort。

**Spec:** `docs/superpowers/specs/2026-08-21-yue-e-open-world-scene-design.md`

**Umbrella Plan:** `docs/superpowers/plans/2026-08-21-yue-e-phase-1-character-runtime-shell.md` Tasks 5–6。本文件是 Phase 1B 的执行细化；Gate A 由 Phase 1A 负责，入口桥、缓存和安装器统一由 Phase 1C 负责。

## Global Constraints

- **Gate A 是硬前置。** `yue-e-traveler-gate.json` 必须为 `approval.status:"approved"`，`approvedModelSha256` 必须等于当前候选 GLB 的完整大写 SHA-256；任一不满足即停止，不创建 `web/assets/yue-e/`。
- 本子计划只创建/修改下方 File Map 中的 Phase 1B 文件；不得改 `web/index.html`、`web/app.js`、`web/cache-fingerprints.json`、CSS、安装器或移动端复制清单。
- 运行时公开面固定为 `mount / enter / exit / snapshot / restore / dispose` 六个方法；不得读取 `window.state`、`window.els` 或任意未注入的应用 DOM。
- `#audio` 与播放器是唯一权威。Phase 1B 只允许读取 `playerCommands.snapshot()`；不得调用 `play/pause/next/previous/seek`，不得读写媒体元素或队列。
- 浏览器 ESM 的每个相对静态 import 都带 `?v=20260821-yue-e-phase1-1`；Node 构建脚本之间不加浏览器查询键。
- 运行资产是 `yue-e-traveler-lookdev.<12-uppercase-hex>.glb`；manifest 是唯一可变指针。任何提交前故障不得改变旧 manifest 指向的字节。
- GLB 必须是获批字节、自包含 glTF 2.0、无外部 URI/DRACO/Meshopt/KTX2、空 `animations`，运行时不得自动缩放、自动居中或播放动画。
- 基础页面在 fetch/校验/parse 阶段继续渲染。只有 shell 已构造、准备开始第一帧审计时才申请重型 RAF 租约；租约 resolve 前必须证明基础重型 RAF 为零。
- 同一时刻 `baseHeavyRafPending + yueEHeavyRafPending <= 1`。退出先取消遇E RAF，再释放租约；context 恢复期间持有租约但不运行 RAF。
- Phase 1B 只认识 `heavyRafCoordinator.acquire({ owner:"yue-e", signal })` / `lease.release()`。Phase 1C 必须把现有 `setBaseRenderSuspended(true/false)` 封装在这个适配器内部；不得把该布尔函数再暴露给运行时，也不得形成第二套暂停协议。
- 首次显现只在 terrain/collision/character/anchors/renderer/frame 六项连续三次健康后发生；任何一项为 false 都把计数清零。
- WebGL context loss 仅在同一个仍存活 runtime 内恢复。8 秒超时、重建失败、过期/异实例临时快照均安全回到重生环或基础错误面，且清空 timer/listener/RAF。
- 规格 v2 快照包含 `durable`、`volatileRecovery` 和附加 `diagnostics`。歌曲、进度、队列、媒体 URL 和播放器可恢复状态绝不进入快照。
- 当前工作树预先很脏。开始每个任务前读相关 diff；新文件可直接暂存，若 Phase 1A 文件已脏则只用 `git add -p -- <path>` 暂存本任务区块。
- 手工编辑必须使用 `apply_patch`。只有 promotion CLI 可以写生成的 GLB/manifest；测试只写 `mkdtemp()` 临时目录。

---

## File Map

### Gate A inputs（只读，必须已存在）

| Path | Responsibility |
| --- | --- |
| `web/yue-e/package.json` | 使浏览器共享 `.js` 在 Node 中按 ESM 导入。 |
| `web/yue-e/character/lookdev-contract.js` | 唯一角色、骨骼、材质、资源 ID 合约。 |
| `scripts/yue-e/lib/glb-v2.mjs` | 原始 GLB 容器/accessor 解析。 |
| `scripts/check-yue-e-character-asset.mjs` | `validateYueELookdev`、`canonicalRigFingerprint` 和 Gate A CLI。 |
| `docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-lookdev.glb` | 用户实际批准的候选字节。 |
| `docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json` | 锚点、合约、模型、rig 指纹和批准记录。 |

### Phase 1B files

| Path | Change | Single responsibility |
| --- | --- | --- |
| `scripts/yue-e/lib/approved-lookdev.mjs` | Create | 重新验证 Gate A 证据并返回不可变批准证据。 |
| `scripts/yue-e/promote-traveler-lookdev.mjs` | Create | 内容寻址 GLB 安装、manifest 原子提交和安全孤儿清理。 |
| `scripts/check-yue-e-approved-lookdev.mjs` | Create | 可复用批准验证器契约。 |
| `scripts/check-yue-e-promotion.mjs` | Create | 提升故障注入/提交点测试。 |
| `web/yue-e/core/errors.js` | Create | 统一安全错误码与消息清洗。 |
| `web/yue-e/core/lifecycle.js` | Create | 纯生命周期图、单调 token、稳定 exit descriptor。 |
| `web/yue-e/core/stable-frames.js` | Create | 单 RAF/单 timer 的连续健康帧门。 |
| `web/yue-e/core/snapshot.js` | Create | 规格 v2 快照构造、验证和损坏重置。 |
| `web/yue-e/core/context-recovery.js` | Create | context loss/restore 子状态、8 秒超时和临时姿态。 |
| `web/yue-e/assets/asset-gate.js` | Create | HTTP、URL、manifest、SHA、abort/stale 字节门。 |
| `web/yue-e/character/lookdev-loader.js` | Create | GLTFLoader parse、运行时结构复核和 traveler 资源所有权。 |
| `web/yue-e/world/phase-1-collision.js` | Create | 从获批 body metrics 导出惰性运动学胶囊。 |
| `web/yue-e/music-zone/anchors.js` | Create | 重生点及四个未来 UI 的类型化 Object3D 锚点。 |
| `web/yue-e/scene/shell-scene.js` | Create | 空音乐区场景、renderer ledger、resize、readiness 和释放。 |
| `web/yue-e/runtime.js` | Create | 六方法组合运行时、租约、RAF、重试、退出和恢复。 |
| `scripts/check-yue-e-runtime-state.mjs` | Create | 生命周期与帧门。 |
| `scripts/check-yue-e-snapshot.mjs` | Create | 快照/restore 合约。 |
| `scripts/check-yue-e-asset-gate.mjs` | Create | 字节门、parse、stale 和安全错误。 |
| `scripts/check-yue-e-shell-scene.mjs` | Create | 胶囊、锚点、场景、r128/r185 和 ledger。 |
| `scripts/check-yue-e-context-recovery.mjs` | Create | fake timer/event 的恢复成功/失败/超时。 |
| `scripts/check-yue-e-runtime-shell.mjs` | Create | 组合 runtime、单重型 RAF、重试和退出。 |
| `scripts/check-yue-e-shell-modules.mjs` | Create | 文件面、版本 import、禁止全局/音频 API 和聚合执行。 |
| `web/assets/yue-e/character/yue-e-traveler-lookdev.<SHA12>.glb` | Generate | 唯一获批、不可变运行字节。 |
| `web/assets/yue-e/character/yue-e-traveler-lookdev.manifest.json` | Generate | 当前运行资产的唯一提交指针。 |

## Canonical Interfaces

所有实现都是 JavaScript；以下 TypeScript-shaped 合约是字段、方法和返回语义的规范来源。

```ts
type UpperSha256 = string; // /^[A-F0-9]{64}$/
type Vec3 = readonly [number, number, number];
type RafHandle = unknown;
type TimerHandle = unknown;

interface TimerPort {
  now(): number;
  setTimer(callback: () => void, delayMs: number): TimerHandle;
  clearTimer(handle: TimerHandle): void;
}

interface HeavyRafLease {
  readonly owner: "yue-e";
  readonly released: boolean;
  release(): void; // idempotent; resumes the base mode that is current at release time
}

interface HeavyRafCoordinator {
  acquire(input: {
    owner: "yue-e";
    signal: AbortSignal;
  }): Promise<HeavyRafLease>; // resolves only after every base heavy RAF is cancelled
  diagnostics(): HeavyRafCoordinatorDiagnostics;
}

interface ApprovedLookdevEvidence {
  gate: Readonly<Record<string, unknown>>;
  modelSha256: UpperSha256;
  contractSha256: UpperSha256;
  rigFingerprintSha256: UpperSha256;
  approvedLod0FingerprintSha256: UpperSha256;
  approvedGateSha256: UpperSha256;
  candidatePath: string;
  candidateBytes: Uint8Array;
  report: Readonly<Record<string, unknown>>;
}

type PromotionFaultPoint =
  | "after-asset-rename"
  | "before-manifest-rename"
  | "during-prune";

interface PromotionOptions {
  root: string;
  gate: string;
  candidate: string;
  contract: string;
  outDirectory: string;
  outManifest: string;
  faultInjector?: (point: PromotionFaultPoint) => void;
}

interface PromotionReport {
  committed: boolean;
  clean: boolean;
  assetRelativePath: string;
  manifestRelativePath: string;
  sha256: UpperSha256;
  byteLength: number;
  removedOrphans: readonly string[];
}

interface TravelerManifestV1 {
  version: 1;
  profile: "phase-1-lookdev";
  assetUrl: `./yue-e-traveler-lookdev.${string}.glb`;
  sha256: UpperSha256;
  approvedModelSha256: UpperSha256;
  approvedGateSha256: UpperSha256;
  byteLength: number;
  heightMeters: number;
  triangleCount: number;
  boneCount: number;
  wingPanelCount: 12;
  bodyBounds: { min: Vec3; max: Vec3 };
  bodyMaxRadialDistance: number;
  lod0SemanticIds: readonly string[];
  bindPoseMaxResidual: number;
  exportedPoseProbes: readonly {
    bone: string;
    passed: true;
    movedVertexCount: number;
    maxMovedMeters: number;
    controlMaxMovedMeters: number;
  }[];
  lookdevContractSha256: UpperSha256;
  rigFingerprintSha256: UpperSha256;
  approvedLod0FingerprintSha256: UpperSha256;
  approvedGatePath: string;
}
```

```ts
type YueEPhase =
  | "idle" | "mounted" | "loading" | "ready"
  | "entering" | "active" | "error" | "exiting" | "disposed";

type YueERecoveryPhase =
  | "none" | "lost" | "rebuilding" | "fading-in" | "failed";

type YueEExitReason =
  | "button" | "escape" | "navigation" | "mode-switch"
  | "visibility-hidden" | "pagehide-persisted" | "runtime-error";

type YueEErrorCode =
  | "YUE_E_INVALID_TRANSITION"
  | "YUE_E_ENTER_ABORTED"
  | "YUE_E_STABLE_FRAME_TIMEOUT"
  | "YUE_E_RESOURCE_UNKNOWN"
  | "YUE_E_ASSET_NETWORK"
  | "YUE_E_ASSET_URL"
  | "YUE_E_ASSET_HASH"
  | "YUE_E_ASSET_PARSE"
  | "YUE_E_ASSET_CONTRACT"
  | "YUE_E_WEBGL_UNAVAILABLE"
  | "YUE_E_CONTEXT_RESTORE_TIMEOUT"
  | "YUE_E_CONTEXT_REBUILD"
  | "YUE_E_SNAPSHOT_INVALID";

interface YueEDomainDependencies {
  playerCommands: {
    snapshot(): { songId: string; queueRevision: number; paused: boolean; currentTime: number };
    subscribe(listener: () => void): () => void;
    play(): Promise<void>;
    pause(): void;
    next(): void;
    previous(): void;
    seek(seconds: number): void;
  };
  playlistNodeProvider: { get(stableId: string): HTMLElement | null };
  achievementEvents: { emit(event: Readonly<Record<string, unknown>>): void };
  spatialAudioBackend: { snapshot(): { kind: string; ready: boolean } };
  resolveResource(stableAssetId: string): string;
  logger: Pick<Console, "debug" | "info" | "warn" | "error">;
}

interface HeavyRafCoordinatorDiagnostics {
  basePending: number;
  yueEPending: number;
  maxCombinedPending: number;
}

interface YueEPlatform {
  documentUrl: string; // absolute current-page URL; asset gate derives the allowed origin from this only
  three: typeof import("three");
  ensureGltfLoader(): Promise<new () => {
    parse(bytes: ArrayBuffer, basePath: string, onLoad: (gltf: unknown) => void, onError: (error: unknown) => void): void;
  }>;
  createRenderer(three: typeof import("three"), options: Record<string, unknown>): unknown;
  elements: {
    root: HTMLElement;
    canvas: HTMLCanvasElement;
    status: HTMLElement;
    recovery: HTMLElement;
    retryButton: HTMLButtonElement;
    exitButton: HTMLButtonElement;
  };
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  cryptoSubtle: SubtleCrypto;
  requestFrame(callback: FrameRequestCallback): RafHandle;
  cancelFrame(handle: RafHandle): void;
  devicePixelRatio(): number;
  resizeObserverFactory(callback: ResizeObserverCallback): {
    observe(target: Element): void;
    disconnect(): void;
  };
  timers: TimerPort;
  heavyRafCoordinator: HeavyRafCoordinator;
  prefersReducedMotion(): boolean;
  waitForSurfaceTransition(input: {
    direction: "enter" | "exit";
    signal: AbortSignal;
  }): Promise<void>;
  setBaseSurfaceObscured(obscured: boolean): void;
  onPhase(detail: { phase: YueEPhase; recoveryPhase: YueERecoveryPhase; errorCode: YueEErrorCode | null }): void;
}
```

```ts
interface StableFrameGateOptions {
  count: 3;
  requestFrame(callback: FrameRequestCallback): RafHandle;
  cancelFrame(handle: RafHandle): void;
  sampleFrame(timeMs: number): boolean; // renders exactly one frame, then returns combined readiness
  signal: AbortSignal;
  timeoutMs: 8000;
  timers: TimerPort;
}

interface CollisionReadiness {
  ready: true;
  kind: "capsule";
  radius: number;
  segmentStart: Vec3;
  segmentEnd: Vec3;
  bodyCenterXZ: readonly [number, number];
  visualOverhangMeters: number;
  source: "approved-body-metrics";
}

type MusicZoneAnchorId = "respawn" | "presetGallery" | "playlist" | "functionDock" | "overlay";

interface AnchorRegistry {
  version: 1;
  ids: readonly MusicZoneAnchorId[];
  get(id: MusicZoneAnchorId): import("three").Object3D;
  entries(): readonly (readonly [MusicZoneAnchorId, import("three").Object3D])[];
  readiness(): { anchors: boolean };
  dispose(): void;
}

interface ShellReadiness {
  terrain: boolean;
  collision: boolean;
  character: boolean;
  anchors: boolean;
  renderer: boolean;
  frame: boolean;
  firstFrameSafe: boolean;
}

interface ShellScene {
  renderFrame(timeMs: number, dtSeconds: number): void;
  readiness(): ShellReadiness;
  setInputEnabled(enabled: boolean): void;
  rebuildRenderer(input: { previousContextLost: true }): Promise<{ rendererGeneration: number }>;
  diagnostics(): {
    rendererGeneration: number;
    rendererCount: number;
    loseContextCalls: number;
    frameCount: number;
    inputEnabled: boolean;
    observerActive: boolean;
    resources: { geometries: number; materials: number; textures: number; renderTargets: number };
    rendererLedgers: readonly {
      generation: number;
      disposed: boolean;
      previousContextLost: boolean;
      forceContextLossCalls: number;
    }[];
  };
  dispose(input?: { previousContextLost?: boolean }): void;
}

interface TravelerHandle {
  scene: import("three").Object3D;
  report: TravelerReport;
  assetSha256: UpperSha256;
  dispose(): void;
}

interface TravelerReport {
  heightMeters: number;
  triangleCount: number;
  boneCount: number;
  wingPanelCount: 12;
  bodyBounds: { min: Vec3; max: Vec3 };
  bodyMaxRadialDistance: number;
  lod0SemanticIds: readonly string[];
  bindPoseMaxResidual: number;
  exportedPoseProbes: readonly {
    bone: string;
    passed: true;
    movedVertexCount: number;
    maxMovedMeters: number;
    controlMaxMovedMeters: number;
  }[];
  rigFingerprintSha256: UpperSha256;
  approvedLod0FingerprintSha256: UpperSha256;
}
```

```ts
interface YueEDurableV2 {
  cameraMode: "third-person";
  world: { seedVersion: 1; visitedRegions: readonly string[]; discoveredLandmarks: readonly string[] };
  musicZone: { panelTransforms: Readonly<Record<string, never>>; focusedPresetId: null };
  accessibility: { cameraShake: 0.15; fovFirstPerson: 78; fovThirdPerson: 50 };
}

interface VolatileRecoveryV2 {
  runtimeId: string;
  logicalPosition: Vec3;
  logicalRotation: number;
  movementMode: "ground";
  capturedAt: number;
}

interface YueERuntimeDiagnosticsV2 {
  phase: YueEPhase;
  recoveryPhase: YueERecoveryPhase;
  operationToken: number;
  stableFrames: number;
  rafRunning: boolean;
  listenerCount: number;
  resources: { geometries: number; materials: number; textures: number; renderTargets: number };
  rendererCount: number;
  loseContextCalls: number;
  heavyRaf: HeavyRafCoordinatorDiagnostics;
  assetSha256: UpperSha256 | null;
  errorCode: YueEErrorCode | null;
}

interface YueESnapshotV2 {
  version: 2;
  durable: YueEDurableV2;
  volatileRecovery: VolatileRecoveryV2 | null;
  diagnostics: YueERuntimeDiagnosticsV2;
}

type RestoreResult =
  | { ok: true; reset: false; spawn: "respawn"; value: YueEDurableV2 }
  | { ok: false; reset: true; spawn: "respawn"; errorCode: "YUE_E_SNAPSHOT_INVALID" };

interface FeYueE {
  mount(dependencies: YueEDomainDependencies): void;
  enter(options?: { reason?: "button" | "retry"; signal?: AbortSignal }): Promise<{ ready: true; stableFrames: 3; gateReport: Readonly<Record<string, unknown>> }>;
  exit(reason: YueEExitReason): Promise<{ exited: true; reason: YueEExitReason }>;
  snapshot(): YueESnapshotV2;
  restore(snapshot: unknown): RestoreResult;
  dispose(): void;
}

interface ContextRecoveryController {
  handleLost(event: Event & { preventDefault(): void }): void;
  handleRestored(): Promise<void>;
  snapshot(): { phase: YueERecoveryPhase; generation: number; hasVolatilePose: boolean };
  dispose(): void;
}

interface ContextRecoveryOptions {
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  timers: TimerPort;
  runtimeId: string;
  timeoutMs: 8000;
  maxPoseAgeMs: 10000;
  canRecover(): boolean;
  stopRendering(): void;
  setInputEnabled(enabled: boolean): void;
  capturePose(): VolatileRecoveryV2;
  applyPose(pose: VolatileRecoveryV2): void;
  respawn(): void;
  collisionReady(): boolean;
  rebuildRenderer(): Promise<void>;
  renderStableFrames(signal: AbortSignal): Promise<{ stableFrames: 3 }>;
  fadeIn(signal: AbortSignal): Promise<void>;
  resumeRendering(): void;
  onPhase(phase: YueERecoveryPhase): void;
  onFailure(error: { code: "YUE_E_CONTEXT_RESTORE_TIMEOUT" | "YUE_E_CONTEXT_REBUILD" }): void;
}
```

### Phase 1C heavy-RAF adapter handoff

Phase 1C implements one adapter and injects it as `platform.heavyRafCoordinator`; Phase 1B never imports `app.js` or calls the boolean seam itself. The adapter shape is fixed now:

```ts
function createHeavyRafCoordinatorAdapter(input: {
  setBaseRenderSuspended(suspended: boolean): void;
  waitForBaseHeavyRafIdle(signal: AbortSignal): Promise<void>;
  readDiagnostics(): HeavyRafCoordinatorDiagnostics;
}): HeavyRafCoordinator;
```

`acquire()` calls `setBaseRenderSuspended(true)` once, awaits `waitForBaseHeavyRafIdle(signal)`, and only then resolves the lease. Abort before resolve calls `setBaseRenderSuspended(false)` once. `lease.release()` is idempotent and calls `setBaseRenderSuspended(false)` once so `app.js` resumes whichever base mode is current at release time. This adapter is the only legal mapping of the umbrella plan's boolean seam; Phase 1C must not give `FeYueE` direct access to either source callback.

## Gate A Entry Check

- [ ] **Step 1: Verify the Phase 1A files are present.**

  Run:

  ```powershell
  @(
    "web\yue-e\package.json",
    "web\yue-e\character\lookdev-contract.js",
    "scripts\yue-e\lib\glb-v2.mjs",
    "scripts\check-yue-e-character-asset.mjs",
    "docs\superpowers\assets\yue-e\lookdev\yue-e-traveler-lookdev.glb",
    "docs\superpowers\assets\yue-e\lookdev\yue-e-traveler-gate.json"
  ) | ForEach-Object { if (!(Test-Path -LiteralPath $_)) { throw "Gate A input missing: $_" } }
  ```

  Expected: exit 0 with no missing path.

- [ ] **Step 2: Re-run the approved static asset gate.**

  Run:

  ```powershell
  node scripts/check-yue-e-lookdev-contract.mjs
  node scripts/check-yue-e-glb-parser.mjs
  node scripts/check-yue-e-character-asset.mjs --stage=lookdev
  ```

  Expected: all commands exit 0 and the asset report still says 39 bones, 12 wing panels, 0 animations and the approved SHA.

- [ ] **Step 3: Prove the recorded approval matches current bytes.**

  Run:

  ```powershell
  $gate = Get-Content -Raw -LiteralPath "docs\superpowers\assets\yue-e\lookdev\yue-e-traveler-gate.json" | ConvertFrom-Json
  $actual = (Get-FileHash -LiteralPath "docs\superpowers\assets\yue-e\lookdev\yue-e-traveler-lookdev.glb" -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($gate.approval.status -ne "approved") { throw "Gate A is not approved" }
  if ($gate.approval.approvedModelSha256 -ne $actual) { throw "Approved SHA does not match candidate" }
  if ($gate.model.sha256 -ne $actual) { throw "Gate model SHA does not match candidate" }
  ```

  Expected: exit 0. On any failure, stop this plan and return to Phase 1A; do not create runtime assets.

---

### Task 1: Make Gate A verification import-safe and reusable

**Files:**

- Create: `scripts/yue-e/lib/approved-lookdev.mjs`
- Create: `scripts/check-yue-e-approved-lookdev.mjs`
- Modify: `scripts/check-yue-e-character-asset.mjs` only to export its pure validator/fingerprint and guard CLI execution

**Interfaces:**

- Consumes: `readGlbV2`, `validateYueELookdev`, `canonicalRigFingerprint`, approved gate/candidate/contract.
- Produces: `verifyApprovedLookdev(options: Omit<PromotionOptions,"outDirectory"|"outManifest"|"faultInjector">) -> Promise<ApprovedLookdevEvidence>`.

- [ ] **Step 1: Add a failing import-surface test.**

  Create `scripts/check-yue-e-approved-lookdev.mjs` with this first test:

  ```js
  import assert from "node:assert/strict";
  import test from "node:test";

  test("Gate A checker exposes import-safe validator primitives", async () => {
    const module = await import("./check-yue-e-character-asset.mjs?approved-verifier-test=1");
    assert.equal(typeof module.validateYueELookdev, "function");
    assert.equal(typeof module.canonicalRigFingerprint, "function");
  });
  ```

- [ ] **Step 2: Run the import-surface test and verify RED.**

  Run: `node scripts/check-yue-e-approved-lookdev.mjs`

  Expected: FAIL because one or both functions are not exported, or importing the checker executes its CLI.

- [ ] **Step 3: Export the two existing pure functions and guard the CLI.**

  Apply this exact main-guard shape in `scripts/check-yue-e-character-asset.mjs`; keep the existing function bodies and CLI output unchanged:

  ```js
  import path from "node:path";
  import { pathToFileURL } from "node:url";

  export { validateYueELookdev, canonicalRigFingerprint };

  const isMain = process.argv[1]
    && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

  if (isMain) {
    await main();
  }
  ```

- [ ] **Step 4: Re-run the original CLI and import test.**

  Run:

  ```powershell
  node scripts/check-yue-e-character-asset.mjs --stage=lookdev
  node scripts/check-yue-e-approved-lookdev.mjs
  ```

  Expected: original JSON report is unchanged; the import test passes.

- [ ] **Step 5: Add the approved-evidence success and tamper tests.**

  Append these tests to `scripts/check-yue-e-approved-lookdev.mjs`:

  ```js
  import fs from "node:fs/promises";
  import os from "node:os";
  import path from "node:path";
  import { verifyApprovedLookdev } from "./yue-e/lib/approved-lookdev.mjs";

  const projectRoot = path.resolve(import.meta.dirname, "..");
  const options = {
    root: projectRoot,
    gate: "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json",
    candidate: "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-lookdev.glb",
    contract: "web/yue-e/character/lookdev-contract.js"
  };

  test("approved evidence recomputes every Gate A binding", async () => {
    const evidence = await verifyApprovedLookdev(options);
    assert.match(evidence.modelSha256, /^[A-F0-9]{64}$/u);
    assert.equal(evidence.modelSha256, evidence.gate.approval.approvedModelSha256);
    assert.equal(evidence.rigFingerprintSha256, evidence.gate.rigFingerprintSha256);
    assert.equal(evidence.approvedLod0FingerprintSha256, evidence.gate.approvedLod0FingerprintSha256);
    assert.match(evidence.approvedGateSha256, /^[A-F0-9]{64}$/u);
  });

  test("approved evidence rejects changed candidate bytes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "yue-e-approved-"));
    for (const relative of [
      "web/yue-e",
      "scripts/yue-e",
      "scripts/check-yue-e-character-asset.mjs",
      "docs/superpowers/assets/yue-e"
    ]) {
      await fs.cp(path.join(projectRoot, relative), path.join(tempRoot, relative), { recursive: true });
    }
    const candidate = path.join(tempRoot, options.candidate);
    await fs.appendFile(candidate, Buffer.from([0]));
    await assert.rejects(
      verifyApprovedLookdev({ ...options, root: tempRoot }),
      (error) => error.code === "YUE_E_APPROVAL_MODEL_HASH"
    );
  });
  ```

- [ ] **Step 6: Run the new cases and verify the missing-module RED.**

  Run: `node scripts/check-yue-e-approved-lookdev.mjs`

  Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/yue-e/lib/approved-lookdev.mjs`.

- [ ] **Step 7: Implement root-contained path and uppercase hashing helpers.**

  Start `scripts/yue-e/lib/approved-lookdev.mjs` with:

  ```js
  import crypto from "node:crypto";
  import fs from "node:fs/promises";
  import path from "node:path";
  import { pathToFileURL } from "node:url";
  import { readGlbV2 } from "./glb-v2.mjs";
  import {
    canonicalApprovedLod0Fingerprint,
    canonicalRigFingerprint,
    validateYueELookdev
  } from "../../check-yue-e-character-asset.mjs";

  function underRoot(root, relative, code) {
    if (path.isAbsolute(relative)) throw Object.assign(new Error(code), { code });
    const absolute = path.resolve(root, relative);
    const relation = path.relative(root, absolute);
    if (!relation || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
      throw Object.assign(new Error(code), { code });
    }
    return absolute;
  }

  const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
  const requireEqual = (actual, expected, code) => {
    if (actual !== expected) throw Object.assign(new Error(code), { code });
  };
  ```

- [ ] **Step 8: Implement `verifyApprovedLookdev`.**

  Add this complete orchestration body:

  ```js
  export async function verifyApprovedLookdev({ root, gate, candidate, contract }) {
    const rootPath = path.resolve(root);
    const gatePath = underRoot(rootPath, gate, "YUE_E_APPROVAL_PATH");
    const candidatePath = underRoot(rootPath, candidate, "YUE_E_APPROVAL_PATH");
    const contractPath = underRoot(rootPath, contract, "YUE_E_APPROVAL_PATH");
    const gateBytes = await fs.readFile(gatePath);
    const gateValue = JSON.parse(gateBytes.toString("utf8"));
    const candidateBytes = await fs.readFile(candidatePath);
    const contractBytes = await fs.readFile(contractPath);
    const modelSha256 = sha256(candidateBytes);
    const contractSha256 = sha256(contractBytes);
    const approvedGateSha256 = sha256(gateBytes);

    requireEqual(gateValue.version, 1, "YUE_E_APPROVAL_GATE_VERSION");
    requireEqual(gateValue.stage, "lookdev", "YUE_E_APPROVAL_GATE_STAGE");
    requireEqual(gateValue.approval?.status, "approved", "YUE_E_APPROVAL_REQUIRED");
    requireEqual(gateValue.model?.sha256, modelSha256, "YUE_E_APPROVAL_MODEL_HASH");
    requireEqual(gateValue.approval?.approvedModelSha256, modelSha256, "YUE_E_APPROVAL_MODEL_HASH");
    requireEqual(gateValue.lookdevContractSha256, contractSha256, "YUE_E_APPROVAL_CONTRACT_HASH");

    for (const anchor of gateValue.anchors) {
      const anchorBytes = await fs.readFile(underRoot(rootPath, anchor.path, "YUE_E_APPROVAL_PATH"));
      requireEqual(sha256(anchorBytes), anchor.sha256, "YUE_E_APPROVAL_ANCHOR_HASH");
    }

    const contractUrl = `${pathToFileURL(contractPath).href}?sha=${contractSha256}`;
    const contractModule = await import(contractUrl);
    const glb = readGlbV2(candidateBytes);
    const report = validateYueELookdev(glb.json, glb.bin, contractModule);
    if (report.errors.length) throw Object.assign(new Error("YUE_E_APPROVAL_ASSET"), { code: "YUE_E_APPROVAL_ASSET" });
    const rigFingerprintSha256 = canonicalRigFingerprint(report);
    const approvedLod0FingerprintSha256 = canonicalApprovedLod0Fingerprint(report, glb.json, glb.bin);
    requireEqual(rigFingerprintSha256, gateValue.rigFingerprintSha256, "YUE_E_APPROVAL_RIG_HASH");
    requireEqual(
      approvedLod0FingerprintSha256,
      gateValue.approvedLod0FingerprintSha256,
      "YUE_E_APPROVAL_LOD0_HASH"
    );

    return Object.freeze({
      gate: Object.freeze(gateValue),
      modelSha256,
      contractSha256,
      rigFingerprintSha256,
      approvedLod0FingerprintSha256,
      approvedGateSha256,
      candidatePath,
      candidateBytes: new Uint8Array(candidateBytes),
      report: Object.freeze(report)
    });
  }
  ```

- [ ] **Step 9: Run approval-verifier checks to GREEN.**

  Run: `node scripts/check-yue-e-approved-lookdev.mjs`

  Expected: TAP passes all three subtests and prints no absolute path.

- [ ] **Step 10: Commit the verifier boundary.**

  ```powershell
  git add scripts/yue-e/lib/approved-lookdev.mjs scripts/check-yue-e-approved-lookdev.mjs
  git add -p -- scripts/check-yue-e-character-asset.mjs
  git diff --cached --check
  git commit -m "refactor: expose approved Yue E lookdev verifier"
  ```

---

### Task 2: Promote the approved bytes with a manifest commit point

**Files:**

- Create: `scripts/yue-e/promote-traveler-lookdev.mjs`
- Create: `scripts/check-yue-e-promotion.mjs`
- Generate: `web/assets/yue-e/character/yue-e-traveler-lookdev.<SHA12>.glb`
- Generate: `web/assets/yue-e/character/yue-e-traveler-lookdev.manifest.json`

**Interfaces:**

- Consumes: `verifyApprovedLookdev(PromotionOptions) -> ApprovedLookdevEvidence`.
- Produces: `promoteTravelerLookdev(PromotionOptions) -> Promise<PromotionReport>` and a no-argument CLI using repository defaults.

- [ ] **Step 1: Write the approved-byte and content-address tests.**

  Start `scripts/check-yue-e-promotion.mjs` with:

  ```js
  import assert from "node:assert/strict";
  import fs from "node:fs/promises";
  import os from "node:os";
  import path from "node:path";
  import test from "node:test";
  import { promoteTravelerLookdev } from "./yue-e/promote-traveler-lookdev.mjs";

  const sourceRoot = path.resolve(import.meta.dirname, "..");

  async function fixture() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "yue-e-promote-"));
    for (const relative of [
      "web/yue-e",
      "scripts/yue-e/lib",
      "scripts/check-yue-e-character-asset.mjs",
      "docs/superpowers/assets/yue-e"
    ]) {
      await fs.cp(path.join(sourceRoot, relative), path.join(root, relative), { recursive: true });
    }
    return {
      root,
      gate: "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json",
      candidate: "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-lookdev.glb",
      contract: "web/yue-e/character/lookdev-contract.js",
      outDirectory: "web/assets/yue-e/character",
      outManifest: "web/assets/yue-e/character/yue-e-traveler-lookdev.manifest.json"
    };
  }

  test("promotion installs exact approved bytes under uppercase SHA12", async () => {
    const options = await fixture();
    const report = await promoteTravelerLookdev(options);
    const manifest = JSON.parse(await fs.readFile(path.join(options.root, options.outManifest), "utf8"));
    assert.match(manifest.assetUrl, /^\.\/yue-e-traveler-lookdev\.[A-F0-9]{12}\.glb$/u);
    const promoted = await fs.readFile(path.join(options.root, options.outDirectory, manifest.assetUrl.slice(2)));
    const candidate = await fs.readFile(path.join(options.root, options.candidate));
    assert.deepEqual(promoted, candidate);
    assert.equal(report.committed, true);
    assert.equal(report.clean, true);
  });
  ```

- [ ] **Step 2: Add commit-point fault tests.**

  Append:

  ```js
  for (const point of ["after-asset-rename", "before-manifest-rename"]) {
    test(`fault at ${point} preserves the old committed manifest`, async () => {
      const options = await fixture();
      const out = path.join(options.root, options.outDirectory);
      await fs.mkdir(out, { recursive: true });
      const oldName = "yue-e-traveler-lookdev.AAAAAAAAAAAA.glb";
      await fs.writeFile(path.join(out, oldName), Buffer.from("old-approved"));
      const oldManifest = JSON.stringify({ version: 1, assetUrl: `./${oldName}`, sha256: "A".repeat(64) });
      await fs.writeFile(path.join(options.root, options.outManifest), oldManifest);
      await assert.rejects(promoteTravelerLookdev({
        ...options,
        faultInjector(current) {
          if (current === point) throw new Error(`fault:${point}`);
        }
      }));
      assert.equal(await fs.readFile(path.join(options.root, options.outManifest), "utf8"), oldManifest);
      assert.equal(await fs.readFile(path.join(out, oldName), "utf8"), "old-approved");
    });
  }
  ```

- [ ] **Step 3: Add post-commit pruning-scope tests.**

  Append:

  ```js
  test("successful retry prunes only unreferenced content-addressed siblings", async () => {
    const options = await fixture();
    const out = path.join(options.root, options.outDirectory);
    await fs.mkdir(out, { recursive: true });
    await fs.writeFile(path.join(out, "yue-e-traveler-lookdev.BBBBBBBBBBBB.glb"), "orphan");
    await fs.writeFile(path.join(out, "keep-notes.txt"), "keep");
    await fs.mkdir(path.join(out, "yue-e-traveler-lookdev.CCCCCCCCCCCC.glb"));
    const report = await promoteTravelerLookdev(options);
    assert.deepEqual(report.removedOrphans, ["yue-e-traveler-lookdev.BBBBBBBBBBBB.glb"]);
    assert.equal(await fs.readFile(path.join(out, "keep-notes.txt"), "utf8"), "keep");
    assert.equal((await fs.stat(path.join(out, "yue-e-traveler-lookdev.CCCCCCCCCCCC.glb"))).isDirectory(), true);
  });
  ```

- [ ] **Step 4: Run promotion tests and verify RED.**

  Run: `node scripts/check-yue-e-promotion.mjs`

  Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `promote-traveler-lookdev.mjs`.

- [ ] **Step 5: Implement fsync-and-rename helpers.**

  Begin `scripts/yue-e/promote-traveler-lookdev.mjs` with:

  ```js
  import fs from "node:fs/promises";
  import path from "node:path";
  import { fileURLToPath, pathToFileURL } from "node:url";
  import { verifyApprovedLookdev } from "./lib/approved-lookdev.mjs";

  const ASSET_NAME = /^yue-e-traveler-lookdev\.[A-F0-9]{12}\.glb$/u;

  function resolveOutput(root, relative) {
    if (path.isAbsolute(relative)) throw Object.assign(new Error("YUE_E_PROMOTION_PATH"), { code: "YUE_E_PROMOTION_PATH" });
    const absolute = path.resolve(root, relative);
    const relation = path.relative(root, absolute);
    if (!relation || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
      throw Object.assign(new Error("YUE_E_PROMOTION_PATH"), { code: "YUE_E_PROMOTION_PATH" });
    }
    return absolute;
  }

  async function writeDurableTemp(target, bytes) {
    const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
    const handle = await fs.open(temp, "wx");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return temp;
  }

  async function renameCommit(temp, target) {
    await fs.rename(temp, target);
    const directory = await fs.open(path.dirname(target), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  }
  ```

- [ ] **Step 6: Implement immutable asset installation.**

  Add:

  ```js
  async function installImmutableAsset(target, bytes) {
    try {
      const existing = await fs.readFile(target);
      if (!Buffer.from(existing).equals(Buffer.from(bytes))) {
        throw Object.assign(new Error("YUE_E_PROMOTION_ASSET_COLLISION"), { code: "YUE_E_PROMOTION_ASSET_COLLISION" });
      }
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const temp = await writeDurableTemp(target, bytes);
    try { await renameCommit(temp, target); }
    catch (error) { await fs.rm(temp, { force: true }); throw error; }
  }
  ```

- [ ] **Step 7: Implement manifest construction and the single commit point.**

  Add this body; every manifest field comes from verified evidence, never from caller input:

  ```js
  export async function promoteTravelerLookdev(options) {
    const evidence = await verifyApprovedLookdev(options);
    const root = path.resolve(options.root);
    const outDirectory = resolveOutput(root, options.outDirectory);
    const outManifest = resolveOutput(root, options.outManifest);
    if (path.dirname(outManifest) !== outDirectory
      || path.basename(outManifest) !== "yue-e-traveler-lookdev.manifest.json") {
      throw Object.assign(new Error("YUE_E_PROMOTION_PATH"), { code: "YUE_E_PROMOTION_PATH" });
    }
    const assetName = `yue-e-traveler-lookdev.${evidence.modelSha256.slice(0, 12)}.glb`;
    const assetPath = path.join(outDirectory, assetName);
    await fs.mkdir(outDirectory, { recursive: true });
    await installImmutableAsset(assetPath, evidence.candidateBytes);
    options.faultInjector?.("after-asset-rename");

    const metrics = evidence.report;
    const manifest = {
      version: 1,
      profile: "phase-1-lookdev",
      assetUrl: `./${assetName}`,
      sha256: evidence.modelSha256,
      approvedModelSha256: evidence.modelSha256,
      approvedGateSha256: evidence.approvedGateSha256,
      byteLength: evidence.candidateBytes.byteLength,
      heightMeters: metrics.heightMeters,
      triangleCount: metrics.triangleCount,
      boneCount: metrics.boneCount,
      wingPanelCount: metrics.wingPanelCount,
      bodyBounds: metrics.bodyBounds,
      bodyMaxRadialDistance: metrics.bodyMaxRadialDistance,
      lod0SemanticIds: metrics.lod0SemanticIds,
      bindPoseMaxResidual: metrics.bindPoseMaxResidual,
      exportedPoseProbes: metrics.exportedPoseProbes,
      lookdevContractSha256: evidence.contractSha256,
      rigFingerprintSha256: evidence.rigFingerprintSha256,
      approvedLod0FingerprintSha256: evidence.approvedLod0FingerprintSha256,
      approvedGatePath: options.gate.replaceAll("\\", "/")
    };
    const manifestTemp = await writeDurableTemp(outManifest, `${JSON.stringify(manifest, null, 2)}\n`);
    try {
      options.faultInjector?.("before-manifest-rename");
      await renameCommit(manifestTemp, outManifest);
    } catch (error) {
      await fs.rm(manifestTemp, { force: true });
      throw error;
    }
  ```

- [ ] **Step 8: Implement verified direct-child pruning and report return.**

  Complete the function with:

  ```js
    const removedOrphans = [];
    let clean = true;
    try {
      for (const entry of await fs.readdir(outDirectory, { withFileTypes: true })) {
        if (!entry.isFile() || !ASSET_NAME.test(entry.name) || entry.name === assetName) continue;
        options.faultInjector?.("during-prune");
        const candidate = path.resolve(outDirectory, entry.name);
        if (path.dirname(candidate) !== outDirectory) throw new Error("YUE_E_PROMOTION_PRUNE_PATH");
        await fs.rm(candidate, { force: true });
        removedOrphans.push(entry.name);
      }
    } catch {
      clean = false;
    }
    return Object.freeze({
      committed: true,
      clean,
      assetRelativePath: path.relative(options.root, assetPath).replaceAll("\\", "/"),
      manifestRelativePath: path.relative(options.root, outManifest).replaceAll("\\", "/"),
      sha256: evidence.modelSha256,
      byteLength: evidence.candidateBytes.byteLength,
      removedOrphans: Object.freeze(removedOrphans.sort())
    });
  }
  ```

- [ ] **Step 9: Add the no-argument CLI and cleanup failure exit.**

  Add:

  ```js
  const isMain = process.argv[1]
    && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

  if (isMain) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const report = await promoteTravelerLookdev({
      root,
      gate: "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json",
      candidate: "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-lookdev.glb",
      contract: "web/yue-e/character/lookdev-contract.js",
      outDirectory: "web/assets/yue-e/character",
      outManifest: "web/assets/yue-e/character/yue-e-traveler-lookdev.manifest.json"
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (!report.clean) process.exitCode = 1;
  }
  ```

- [ ] **Step 10: Run promotion fault tests to GREEN.**

  Run: `node scripts/check-yue-e-promotion.mjs`

  Expected: all four subtests pass; injected pre-commit failures preserve the old manifest and selected bytes.

- [ ] **Step 11: Promote the real Gate A bytes.**

  Run:

  ```powershell
  node scripts/yue-e/promote-traveler-lookdev.mjs
  node scripts/check-yue-e-promotion.mjs
  ```

  Expected: CLI JSON has `committed:true`, `clean:true`; exactly one matching content-addressed GLB exists beside the manifest.

- [ ] **Step 12: Verify production manifest and bytes directly.**

  Run:

  ```powershell
  $dir = "web\assets\yue-e\character"
  $manifest = Get-Content -Raw -LiteralPath (Join-Path $dir "yue-e-traveler-lookdev.manifest.json") | ConvertFrom-Json
  $name = [IO.Path]::GetFileName([string]$manifest.assetUrl)
  if ($name -notmatch '^yue-e-traveler-lookdev\.[A-F0-9]{12}\.glb$') { throw "Bad content-addressed name" }
  $actual = (Get-FileHash -LiteralPath (Join-Path $dir $name) -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($actual -ne $manifest.sha256) { throw "Manifest SHA mismatch" }
  if (@(Get-ChildItem -LiteralPath $dir -File -Filter 'yue-e-traveler-lookdev.*.glb').Count -ne 1) { throw "Unexpected orphan GLB" }
  ```

  Expected: exit 0.

- [ ] **Step 13: Commit the immutable runtime asset and promoter.**

  ```powershell
  git add scripts/yue-e/promote-traveler-lookdev.mjs scripts/check-yue-e-promotion.mjs web/assets/yue-e/character
  git diff --cached --check
  git commit -m "build: promote approved Yue E lookdev bytes"
  ```

---

### Task 3: Implement the lifecycle graph and consecutive-frame gate

**Files:**

- Create: `web/yue-e/core/errors.js`
- Create: `web/yue-e/core/lifecycle.js`
- Create: `web/yue-e/core/stable-frames.js`
- Create: `scripts/check-yue-e-runtime-state.mjs`

**Interfaces:**

- `createYueELifecycle(onTransition) -> { state, mount, beginEnter, isCurrent, markReady, markEntering, markActive, markError, beginExit, finishExit, dispose }`.
- `waitForStableFrames(StableFrameGateOptions) -> Promise<{ stableFrames: 3 }>` owns at most one scheduled RAF and one timeout.

- [ ] **Step 1: Write lifecycle single-flight and stale-token tests.**

  Create `scripts/check-yue-e-runtime-state.mjs` with:

  ```js
  import assert from "node:assert/strict";
  import test from "node:test";
  import { createYueELifecycle } from "../web/yue-e/core/lifecycle.js";
  import { waitForStableFrames } from "../web/yue-e/core/stable-frames.js";

  test("lifecycle follows the approved graph and invalidates stale enter work", () => {
    const seen = [];
    const life = createYueELifecycle((state) => seen.push(state.phase));
    assert.equal(life.state().phase, "idle");
    life.mount();
    const first = life.beginEnter();
    assert.strictEqual(life.beginEnter(), first);
    assert.equal(life.markReady(first.token), true);
    assert.equal(life.markEntering(first.token), true);
    assert.equal(life.markActive(first.token), true);
    const exiting = life.beginExit("button");
    assert.strictEqual(life.beginExit("escape"), exiting);
    assert.equal(life.markError(first.token, "YUE_E_ASSET_PARSE"), false);
    assert.equal(life.finishExit(exiting.token), true);
    assert.equal(life.state().phase, "mounted");
    assert.deepEqual(seen, ["mounted", "loading", "ready", "entering", "active", "exiting", "mounted"]);
  });

  test("invalid transitions fail closed and dispose is final/idempotent", () => {
    const life = createYueELifecycle(() => {});
    assert.throws(() => life.beginEnter(), (error) => error.code === "YUE_E_INVALID_TRANSITION");
    life.mount();
    life.dispose();
    life.dispose();
    assert.equal(life.state().phase, "disposed");
    assert.throws(() => life.mount(), (error) => error.code === "YUE_E_INVALID_TRANSITION");
  });
  ```

- [ ] **Step 2: Add a deterministic fake RAF/timer to the same checker.**

  Append:

  ```js
  class FakeScheduler {
    #next = 1;
    #rafs = new Map();
    #timers = new Map();
    nowMs = 0;
    maxPendingRaf = 0;

    requestFrame = (callback) => {
      const id = this.#next++;
      this.#rafs.set(id, callback);
      this.maxPendingRaf = Math.max(this.maxPendingRaf, this.#rafs.size);
      return id;
    };
    cancelFrame = (id) => { this.#rafs.delete(id); };
    setTimer = (callback) => {
      const id = this.#next++;
      this.#timers.set(id, callback);
      return id;
    };
    clearTimer = (id) => { this.#timers.delete(id); };
    now = () => this.nowMs;
    fireFrame() {
      const [[id, callback]] = this.#rafs;
      this.#rafs.delete(id);
      this.nowMs += 16;
      callback(this.nowMs);
    }
    fireTimer() {
      const [[id, callback]] = this.#timers;
      this.#timers.delete(id);
      callback();
    }
    counts() { return { raf: this.#rafs.size, timer: this.#timers.size }; }
  }

  test("frame gate resets on an unhealthy frame and requires three consecutive renders", async () => {
    const scheduler = new FakeScheduler();
    const samples = [true, true, false, true, true, true];
    const result = waitForStableFrames({
      count: 3,
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame,
      sampleFrame: () => samples.shift(),
      signal: new AbortController().signal,
      timeoutMs: 8000,
      timers: scheduler
    });
    for (let index = 0; index < 6; index += 1) scheduler.fireFrame();
    assert.deepEqual(await result, { stableFrames: 3 });
    assert.equal(scheduler.maxPendingRaf, 1);
    assert.deepEqual(scheduler.counts(), { raf: 0, timer: 0 });
  });

  test("frame gate timeout and abort clear both handles", async () => {
    const timeoutScheduler = new FakeScheduler();
    const timed = waitForStableFrames({
      count: 3,
      requestFrame: timeoutScheduler.requestFrame,
      cancelFrame: timeoutScheduler.cancelFrame,
      sampleFrame: () => false,
      signal: new AbortController().signal,
      timeoutMs: 8000,
      timers: timeoutScheduler
    });
    timeoutScheduler.fireTimer();
    await assert.rejects(timed, (error) => error.code === "YUE_E_STABLE_FRAME_TIMEOUT");
    assert.deepEqual(timeoutScheduler.counts(), { raf: 0, timer: 0 });

    const abortScheduler = new FakeScheduler();
    const controller = new AbortController();
    const aborted = waitForStableFrames({
      count: 3,
      requestFrame: abortScheduler.requestFrame,
      cancelFrame: abortScheduler.cancelFrame,
      sampleFrame: () => true,
      signal: controller.signal,
      timeoutMs: 8000,
      timers: abortScheduler
    });
    controller.abort();
    await assert.rejects(aborted, (error) => error.code === "YUE_E_ENTER_ABORTED");
    assert.deepEqual(abortScheduler.counts(), { raf: 0, timer: 0 });
  });
  ```

- [ ] **Step 3: Run the checker and record the missing-module RED.**

  Run: `node scripts/check-yue-e-runtime-state.mjs`

  Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web/yue-e/core/lifecycle.js`; no production file has been written yet.

- [ ] **Step 4: Implement safe typed errors.**

  Create `web/yue-e/core/errors.js`:

  ```js
  const SAFE_MESSAGES = Object.freeze({
    YUE_E_INVALID_TRANSITION: "遇E当前状态无法执行此操作。",
    YUE_E_ENTER_ABORTED: "遇E进入已取消。",
    YUE_E_STABLE_FRAME_TIMEOUT: "遇E场景未能及时准备完成。",
    YUE_E_RESOURCE_UNKNOWN: "遇E资源标识无效。",
    YUE_E_ASSET_NETWORK: "遇E资源暂时无法读取。",
    YUE_E_ASSET_URL: "遇E资源地址无效。",
    YUE_E_ASSET_HASH: "遇E资源完整性校验失败。",
    YUE_E_ASSET_PARSE: "遇E角色资源无法解析。",
    YUE_E_ASSET_CONTRACT: "遇E角色资源与批准版本不一致。",
    YUE_E_WEBGL_UNAVAILABLE: "当前环境无法启动遇E三维场景。",
    YUE_E_CONTEXT_RESTORE_TIMEOUT: "遇E图形环境恢复超时。",
    YUE_E_CONTEXT_REBUILD: "遇E图形环境恢复失败。",
    YUE_E_SNAPSHOT_INVALID: "遇E保存数据已重置。"
  });

  export class YueEError extends Error {
    constructor(code) {
      super(SAFE_MESSAGES[code] ?? "遇E发生未知错误。");
      this.name = "YueEError";
      this.code = code;
    }
  }

  export function createYueEError(code) {
    return new YueEError(code);
  }

  export function toSafeYueEError(error, fallbackCode) {
    return error instanceof YueEError ? error : new YueEError(fallbackCode);
  }
  ```

- [ ] **Step 5: Implement the tokenized lifecycle controller.**

  Create `web/yue-e/core/lifecycle.js`:

  ```js
  import { createYueEError } from "./errors.js?v=20260821-yue-e-phase1-1";

  export function createYueELifecycle(onTransition) {
    let phase = "idle";
    let token = 0;
    let enterDescriptor = null;
    let exitDescriptor = null;
    let errorCode = null;

    const publish = () => onTransition(Object.freeze({ phase, token, errorCode }));
    const requirePhase = (allowed) => {
      if (!allowed.includes(phase)) throw createYueEError("YUE_E_INVALID_TRANSITION");
    };
    const transition = (next, allowed, nextError = null) => {
      requirePhase(allowed);
      phase = next;
      errorCode = nextError;
      publish();
    };
    const mark = (operationToken, next, allowed, nextError = null) => {
      if (operationToken !== token || phase === "disposed" || phase === "exiting") return false;
      transition(next, allowed, nextError);
      return true;
    };

    return Object.freeze({
      state: () => Object.freeze({ phase, token, errorCode }),
      mount() {
        transition("mounted", ["idle"]);
      },
      beginEnter() {
        if (["loading", "ready", "entering"].includes(phase)) return enterDescriptor;
        requirePhase(["mounted", "error"]);
        token += 1;
        exitDescriptor = null;
        enterDescriptor = Object.freeze({ token });
        phase = "loading";
        errorCode = null;
        publish();
        return enterDescriptor;
      },
      isCurrent: (operationToken) => operationToken === token && phase !== "disposed" && phase !== "exiting",
      markReady: (operationToken) => mark(operationToken, "ready", ["loading"]),
      markEntering: (operationToken) => mark(operationToken, "entering", ["ready"]),
      markActive: (operationToken) => mark(operationToken, "active", ["entering"]),
      markError: (operationToken, code) => mark(operationToken, "error", ["loading", "ready", "entering", "active"], code),
      beginExit(reason) {
        if (phase === "exiting") return exitDescriptor;
        requirePhase(["mounted", "loading", "ready", "entering", "active", "error"]);
        token += 1;
        enterDescriptor = null;
        exitDescriptor = Object.freeze({ token, reason });
        phase = "exiting";
        errorCode = null;
        publish();
        return exitDescriptor;
      },
      finishExit(operationToken) {
        if (operationToken !== token || phase !== "exiting") return false;
        phase = "mounted";
        exitDescriptor = null;
        publish();
        return true;
      },
      dispose() {
        if (phase === "disposed") return;
        token += 1;
        enterDescriptor = null;
        exitDescriptor = null;
        phase = "disposed";
        errorCode = null;
        publish();
      }
    });
  }
  ```

- [ ] **Step 6: Implement the single-RAF stable-frame gate.**

  Create `web/yue-e/core/stable-frames.js`:

  ```js
  import { createYueEError } from "./errors.js?v=20260821-yue-e-phase1-1";

  export function waitForStableFrames(options) {
    return new Promise((resolve, reject) => {
      let rafHandle = null;
      let timerHandle = null;
      let streak = 0;
      let settled = false;

      const cleanup = () => {
        if (rafHandle !== null) options.cancelFrame(rafHandle);
        if (timerHandle !== null) options.timers.clearTimer(timerHandle);
        rafHandle = null;
        timerHandle = null;
        options.signal.removeEventListener("abort", onAbort);
      };
      const fail = (code) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(createYueEError(code));
      };
      const onAbort = () => fail("YUE_E_ENTER_ABORTED");
      const tick = (timeMs) => {
        rafHandle = null;
        if (settled || options.signal.aborted) return onAbort();
        let healthy;
        try { healthy = options.sampleFrame(timeMs) === true; }
        catch { return fail("YUE_E_STABLE_FRAME_TIMEOUT"); }
        streak = healthy ? streak + 1 : 0;
        if (streak >= options.count) {
          settled = true;
          cleanup();
          resolve(Object.freeze({ stableFrames: options.count }));
          return;
        }
        rafHandle = options.requestFrame(tick);
      };

      if (options.signal.aborted) return onAbort();
      options.signal.addEventListener("abort", onAbort, { once: true });
      timerHandle = options.timers.setTimer(() => fail("YUE_E_STABLE_FRAME_TIMEOUT"), options.timeoutMs);
      rafHandle = options.requestFrame(tick);
    });
  }
  ```

- [ ] **Step 7: Run lifecycle/frame tests to GREEN and syntax-check modules.**

  Run:

  ```powershell
  node scripts/check-yue-e-runtime-state.mjs
  node --check web/yue-e/core/errors.js
  node --check web/yue-e/core/lifecycle.js
  node --check web/yue-e/core/stable-frames.js
  ```

  Expected: four TAP subtests pass; `maxPendingRaf` is 1; every syntax check exits 0.

- [ ] **Step 8: Commit the runtime state primitives.**

  ```powershell
  git add web/yue-e/core/errors.js web/yue-e/core/lifecycle.js web/yue-e/core/stable-frames.js scripts/check-yue-e-runtime-state.mjs
  git diff --cached --check
  git commit -m "feat: add Yue E lifecycle and frame gate"
  ```

---

### Task 4: Implement the version-2 snapshot and respawn-only restore boundary

**Files:**

- Create: `web/yue-e/core/snapshot.js`
- Create: `scripts/check-yue-e-snapshot.mjs`

**Interfaces:**

- `createDefaultYueEDurable() -> YueEDurableV2` returns a fresh value.
- `buildYueESnapshot({ durable, volatileRecovery, diagnostics }) -> YueESnapshotV2` validates before returning.
- `restoreYueESnapshot(unknown) -> RestoreResult` never returns or applies a saved coordinate; valid and reset paths both select `spawn:"respawn"`.

- [ ] **Step 1: Write exact-schema, no-media and respawn tests.**

  Create `scripts/check-yue-e-snapshot.mjs`:

  ```js
  import assert from "node:assert/strict";
  import test from "node:test";
  import {
    buildYueESnapshot,
    createDefaultYueEDurable,
    restoreYueESnapshot
  } from "../web/yue-e/core/snapshot.js";

  const diagnostics = Object.freeze({
    phase: "active",
    recoveryPhase: "none",
    operationToken: 4,
    stableFrames: 3,
    rafRunning: true,
    listenerCount: 2,
    resources: { geometries: 5, materials: 5, textures: 0, renderTargets: 0 },
    rendererCount: 1,
    loseContextCalls: 0,
    heavyRaf: { basePending: 0, yueEPending: 1, maxCombinedPending: 1 },
    assetSha256: "A".repeat(64),
    errorCode: null
  });

  function containsForbiddenKey(value) {
    if (!value || typeof value !== "object") return false;
    return Object.entries(value).some(([key, nested]) =>
      /song|queue|media|currentTime|paused|url/iu.test(key) || containsForbiddenKey(nested));
  }

  test("v2 snapshot has durable, volatile recovery and diagnostics but no media state", () => {
    const durable = createDefaultYueEDurable();
    const snapshot = buildYueESnapshot({
      durable,
      volatileRecovery: {
        runtimeId: "runtime-a",
        logicalPosition: [1, 0, -2],
        logicalRotation: 0.5,
        movementMode: "ground",
        capturedAt: 1200
      },
      diagnostics
    });
    assert.deepEqual(Object.keys(snapshot), ["version", "durable", "volatileRecovery", "diagnostics"]);
    assert.equal(snapshot.version, 2);
    assert.equal(containsForbiddenKey(snapshot), false);
    assert.equal(Object.isFrozen(snapshot), true);
  });

  test("normal restore accepts durable state but always respawns", () => {
    const snapshot = buildYueESnapshot({
      durable: createDefaultYueEDurable(),
      volatileRecovery: {
        runtimeId: "runtime-a",
        logicalPosition: [99, 42, -99],
        logicalRotation: 2,
        movementMode: "ground",
        capturedAt: 1200
      },
      diagnostics
    });
    const restored = restoreYueESnapshot(snapshot);
    assert.deepEqual(restored, {
      ok: true,
      reset: false,
      spawn: "respawn",
      value: createDefaultYueEDurable()
    });
    assert.equal("logicalPosition" in restored, false);
  });

  test("legacy or corrupt snapshot resets only Yue E durable state", () => {
    for (const input of [null, { version: 1 }, { version: 2, durable: { cameraMode: "first-person" } }]) {
      assert.deepEqual(restoreYueESnapshot(input), {
        ok: false,
        reset: true,
        spawn: "respawn",
        errorCode: "YUE_E_SNAPSHOT_INVALID"
      });
    }
  });
  ```

- [ ] **Step 2: Run the snapshot checker and record RED.**

  Run: `node scripts/check-yue-e-snapshot.mjs`

  Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web/yue-e/core/snapshot.js`.

- [ ] **Step 3: Implement fresh defaults, exact keys and deep freezing.**

  Start `web/yue-e/core/snapshot.js` with:

  ```js
  import { createYueEError } from "./errors.js?v=20260821-yue-e-phase1-1";

  const PHASES = new Set(["idle", "mounted", "loading", "ready", "entering", "active", "error", "exiting", "disposed"]);
  const RECOVERY_PHASES = new Set(["none", "lost", "rebuilding", "fading-in", "failed"]);
  const ERROR_CODES = new Set([
    "YUE_E_INVALID_TRANSITION", "YUE_E_ENTER_ABORTED", "YUE_E_STABLE_FRAME_TIMEOUT",
    "YUE_E_RESOURCE_UNKNOWN", "YUE_E_ASSET_NETWORK", "YUE_E_ASSET_URL",
    "YUE_E_ASSET_HASH", "YUE_E_ASSET_PARSE", "YUE_E_ASSET_CONTRACT",
    "YUE_E_WEBGL_UNAVAILABLE", "YUE_E_CONTEXT_RESTORE_TIMEOUT",
    "YUE_E_CONTEXT_REBUILD", "YUE_E_SNAPSHOT_INVALID"
  ]);
  const UPPER_SHA = /^[A-F0-9]{64}$/u;
  const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const finite = (value) => Number.isFinite(value);
  const exactKeys = (value, keys) => plain(value)
    && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
  const validVec3 = (value) => Array.isArray(value) && value.length === 3 && value.every(finite);
  const deepFreeze = (value) => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    for (const nested of Object.values(value)) deepFreeze(nested);
    return Object.freeze(value);
  };

  export function createDefaultYueEDurable() {
    return deepFreeze({
      cameraMode: "third-person",
      world: { seedVersion: 1, visitedRegions: [], discoveredLandmarks: [] },
      musicZone: { panelTransforms: {}, focusedPresetId: null },
      accessibility: { cameraShake: 0.15, fovFirstPerson: 78, fovThirdPerson: 50 }
    });
  }
  ```

- [ ] **Step 4: Implement strict durable, volatile and diagnostics validators.**

  Append:

  ```js
  function validDurable(value) {
    return exactKeys(value, ["cameraMode", "world", "musicZone", "accessibility"])
      && value.cameraMode === "third-person"
      && exactKeys(value.world, ["seedVersion", "visitedRegions", "discoveredLandmarks"])
      && value.world.seedVersion === 1
      && [value.world.visitedRegions, value.world.discoveredLandmarks]
        .every((items) => Array.isArray(items) && items.every((item) => typeof item === "string"))
      && exactKeys(value.musicZone, ["panelTransforms", "focusedPresetId"])
      && exactKeys(value.musicZone.panelTransforms, [])
      && value.musicZone.focusedPresetId === null
      && exactKeys(value.accessibility, ["cameraShake", "fovFirstPerson", "fovThirdPerson"])
      && value.accessibility.cameraShake === 0.15
      && value.accessibility.fovFirstPerson === 78
      && value.accessibility.fovThirdPerson === 50;
  }

  function validVolatile(value) {
    return value === null || (
      exactKeys(value, ["runtimeId", "logicalPosition", "logicalRotation", "movementMode", "capturedAt"])
      && typeof value.runtimeId === "string" && value.runtimeId.length > 0
      && validVec3(value.logicalPosition)
      && finite(value.logicalRotation)
      && value.movementMode === "ground"
      && finite(value.capturedAt)
    );
  }

  function validDiagnostics(value) {
    const resourceKeys = ["geometries", "materials", "textures", "renderTargets"];
    const countRecord = (record, keys) => exactKeys(record, keys)
      && keys.every((key) => Number.isInteger(record[key]) && record[key] >= 0);
    return exactKeys(value, [
      "phase", "recoveryPhase", "operationToken", "stableFrames", "rafRunning",
      "listenerCount", "resources", "rendererCount", "loseContextCalls", "heavyRaf",
      "assetSha256", "errorCode"
    ])
      && PHASES.has(value.phase)
      && RECOVERY_PHASES.has(value.recoveryPhase)
      && Number.isInteger(value.operationToken) && value.operationToken >= 0
      && Number.isInteger(value.stableFrames) && value.stableFrames >= 0 && value.stableFrames <= 3
      && typeof value.rafRunning === "boolean"
      && Number.isInteger(value.listenerCount) && value.listenerCount >= 0
      && countRecord(value.resources, resourceKeys)
      && Number.isInteger(value.rendererCount) && value.rendererCount >= 0
      && Number.isInteger(value.loseContextCalls) && value.loseContextCalls >= 0
      && countRecord(value.heavyRaf, ["basePending", "yueEPending", "maxCombinedPending"])
      && (value.assetSha256 === null || UPPER_SHA.test(value.assetSha256))
      && (value.errorCode === null || ERROR_CODES.has(value.errorCode));
  }

  const clone = (value) => structuredClone(value);
  ```

- [ ] **Step 5: Implement snapshot construction and restore.**

  Complete `snapshot.js` with:

  ```js
  export function buildYueESnapshot({ durable, volatileRecovery, diagnostics }) {
    if (!validDurable(durable) || !validVolatile(volatileRecovery) || !validDiagnostics(diagnostics)) {
      throw createYueEError("YUE_E_SNAPSHOT_INVALID");
    }
    return deepFreeze({
      version: 2,
      durable: clone(durable),
      volatileRecovery: clone(volatileRecovery),
      diagnostics: clone(diagnostics)
    });
  }

  export function restoreYueESnapshot(input) {
    if (!exactKeys(input, ["version", "durable", "volatileRecovery", "diagnostics"])
      || input.version !== 2
      || !validDurable(input.durable)
      || !validVolatile(input.volatileRecovery)
      || !validDiagnostics(input.diagnostics)) {
      return Object.freeze({
        ok: false,
        reset: true,
        spawn: "respawn",
        errorCode: "YUE_E_SNAPSHOT_INVALID"
      });
    }
    return deepFreeze({
      ok: true,
      reset: false,
      spawn: "respawn",
      value: clone(input.durable)
    });
  }
  ```

- [ ] **Step 6: Run snapshot tests to GREEN.**

  Run:

  ```powershell
  node scripts/check-yue-e-snapshot.mjs
  node --check web/yue-e/core/snapshot.js
  ```

  Expected: three TAP subtests pass; valid external restore never returns the saved `[99,42,-99]` coordinate.

- [ ] **Step 7: Commit the snapshot boundary.**

  ```powershell
  git add web/yue-e/core/snapshot.js scripts/check-yue-e-snapshot.mjs
  git diff --cached --check
  git commit -m "feat: add Yue E snapshot v2 boundary"
  ```

---

### Task 5: Gate manifest URL, HTTP status and approved bytes before parse

**Files:**

- Create: `web/yue-e/assets/asset-gate.js`
- Create: `scripts/check-yue-e-asset-gate.mjs`

**Interface:**

```ts
function fetchApprovedTravelerBytes(options: {
  manifestUrl: string;
  documentUrl: string;
  fetch: YueEPlatform["fetch"];
  cryptoSubtle: SubtleCrypto;
  signal: AbortSignal;
  isOperationCurrent(): boolean;
}): Promise<{
  manifest: TravelerManifestV1;
  assetUrl: string;
  basePath: string;
  arrayBuffer: ArrayBuffer;
  sha256: UpperSha256;
}>;
```

- [ ] **Step 1: Write a complete approved manifest fixture and happy-path byte test.**

  Create `scripts/check-yue-e-asset-gate.mjs` with:

  ```js
  import assert from "node:assert/strict";
  import { webcrypto } from "node:crypto";
  import test from "node:test";
  import { fetchApprovedTravelerBytes } from "../web/yue-e/assets/asset-gate.js";

  const documentUrl = "https://app.test/index.html";
  const manifestUrl = "https://app.test/assets/yue-e/character/yue-e-traveler-lookdev.manifest.json";
  const bytes = new TextEncoder().encode("approved-glb-bytes");
  const sha = Buffer.from(await webcrypto.subtle.digest("SHA-256", bytes)).toString("hex").toUpperCase();
  const assetUrl = `https://app.test/assets/yue-e/character/yue-e-traveler-lookdev.${sha.slice(0, 12)}.glb`;
  const manifest = Object.freeze({
    version: 1,
    profile: "phase-1-lookdev",
    assetUrl: `./yue-e-traveler-lookdev.${sha.slice(0, 12)}.glb`,
    sha256: sha,
    approvedModelSha256: sha,
    approvedGateSha256: "B".repeat(64),
    byteLength: bytes.byteLength,
    heightMeters: 1.35,
    triangleCount: 42000,
    boneCount: 39,
    wingPanelCount: 12,
    bodyBounds: { min: [-0.3, 0, -0.2], max: [0.3, 1.35, 0.2] },
    bodyMaxRadialDistance: 0.29,
    lod0SemanticIds: ["yue-e.lod0.body"],
    bindPoseMaxResidual: 0.0001,
    exportedPoseProbes: [{
      bone: "LowerArm_L",
      passed: true,
      movedVertexCount: 24,
      maxMovedMeters: 0.08,
      controlMaxMovedMeters: 0.001
    }],
    lookdevContractSha256: "C".repeat(64),
    rigFingerprintSha256: "D".repeat(64),
    approvedLod0FingerprintSha256: "E".repeat(64),
    approvedGatePath: "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json"
  });

  function response(body, url, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      url,
      text: async () => typeof body === "string" ? body : JSON.stringify(body),
      arrayBuffer: async () => body instanceof Uint8Array
        ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
        : new TextEncoder().encode(String(body)).buffer
    };
  }

  function approvedFetch(overrides = {}) {
    return async (url) => {
      if (String(url) === manifestUrl) return overrides.manifestResponse ?? response(manifest, manifestUrl);
      if (String(url) === assetUrl) return overrides.assetResponse ?? response(bytes, assetUrl);
      throw new Error(`unexpected test URL: ${String(url)}`);
    };
  }

  test("approved same-origin bytes pass HTTP, length and SHA before parse", async () => {
    const result = await fetchApprovedTravelerBytes({
      manifestUrl,
      documentUrl,
      fetch: approvedFetch(),
      cryptoSubtle: webcrypto.subtle,
      signal: new AbortController().signal,
      isOperationCurrent: () => true
    });
    assert.equal(result.sha256, sha);
    assert.equal(result.assetUrl, assetUrl);
    assert.equal(result.basePath, "https://app.test/assets/yue-e/character/");
    assert.deepEqual(new Uint8Array(result.arrayBuffer), bytes);
  });
  ```

- [ ] **Step 2: Add HTTP-before-body and URL rejection tests.**

  Append:

  ```js
  test("non-OK response maps to network error before body read", async () => {
    let bodyReads = 0;
    const unavailable = {
      ok: false,
      status: 503,
      url: manifestUrl,
      text: async () => { bodyReads += 1; return "maintenance"; }
    };
    await assert.rejects(fetchApprovedTravelerBytes({
      manifestUrl,
      documentUrl,
      fetch: approvedFetch({ manifestResponse: unavailable }),
      cryptoSubtle: webcrypto.subtle,
      signal: new AbortController().signal,
      isOperationCurrent: () => true
    }), (error) => error.code === "YUE_E_ASSET_NETWORK");
    assert.equal(bodyReads, 0);
  });

  test("cross-origin redirect and encoded separators are rejected", async () => {
    const redirect = response(bytes, "https://evil.test/yue-e-traveler-lookdev.glb");
    await assert.rejects(fetchApprovedTravelerBytes({
      manifestUrl,
      documentUrl,
      fetch: approvedFetch({ assetResponse: redirect }),
      cryptoSubtle: webcrypto.subtle,
      signal: new AbortController().signal,
      isOperationCurrent: () => true
    }), (error) => error.code === "YUE_E_ASSET_URL");

    const encoded = { ...manifest, assetUrl: `./nested%2Fyue-e-traveler-lookdev.${sha.slice(0, 12)}.glb` };
    await assert.rejects(fetchApprovedTravelerBytes({
      manifestUrl,
      documentUrl,
      fetch: async () => response(encoded, manifestUrl),
      cryptoSubtle: webcrypto.subtle,
      signal: new AbortController().signal,
      isOperationCurrent: () => true
    }), (error) => error.code === "YUE_E_ASSET_URL");
  });
  ```

- [ ] **Step 3: Add lineage, SHA, stale-operation and error-redaction tests.**

  Append:

  ```js
  test("manifest lineage mismatch is rejected before GLB fetch", async () => {
    let requests = 0;
    const changed = { ...manifest, approvedModelSha256: "F".repeat(64) };
    await assert.rejects(fetchApprovedTravelerBytes({
      manifestUrl,
      documentUrl,
      fetch: async () => { requests += 1; return response(changed, manifestUrl); },
      cryptoSubtle: webcrypto.subtle,
      signal: new AbortController().signal,
      isOperationCurrent: () => true
    }), (error) => error.code === "YUE_E_ASSET_HASH");
    assert.equal(requests, 1);
  });

  test("wrong bytes produce a redacted hash error", async () => {
    const changedBytes = new TextEncoder().encode("tampered");
    await assert.rejects(fetchApprovedTravelerBytes({
      manifestUrl,
      documentUrl,
      fetch: approvedFetch({ assetResponse: response(changedBytes, assetUrl) }),
      cryptoSubtle: webcrypto.subtle,
      signal: new AbortController().signal,
      isOperationCurrent: () => true
    }), (error) => {
      assert.equal(error.code, "YUE_E_ASSET_HASH");
      assert.equal(error.message.includes("https://"), false);
      assert.equal(error.message.includes(sha), false);
      return true;
    });
  });

  test("operation becoming stale after digest aborts without returning bytes", async () => {
    let checks = 0;
    await assert.rejects(fetchApprovedTravelerBytes({
      manifestUrl,
      documentUrl,
      fetch: approvedFetch(),
      cryptoSubtle: webcrypto.subtle,
      signal: new AbortController().signal,
      isOperationCurrent: () => { checks += 1; return checks < 5; }
    }), (error) => error.code === "YUE_E_ENTER_ABORTED");
  });
  ```

- [ ] **Step 4: Run the byte-gate checker and record RED.**

  Run: `node scripts/check-yue-e-asset-gate.mjs`

  Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web/yue-e/assets/asset-gate.js`.

- [ ] **Step 5: Implement manifest schema and stale-operation helpers.**

  Start `web/yue-e/assets/asset-gate.js` with:

  ```js
  import { createYueEError, toSafeYueEError } from "../core/errors.js?v=20260821-yue-e-phase1-1";

  const UPPER_SHA = /^[A-F0-9]{64}$/u;
  const MANIFEST_KEYS = [
    "version", "profile", "assetUrl", "sha256", "approvedModelSha256",
    "approvedGateSha256", "byteLength", "heightMeters", "triangleCount", "boneCount",
    "wingPanelCount", "bodyBounds", "bodyMaxRadialDistance", "lod0SemanticIds",
    "bindPoseMaxResidual", "exportedPoseProbes", "lookdevContractSha256",
    "rigFingerprintSha256", "approvedLod0FingerprintSha256", "approvedGatePath"
  ];
  const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const exactKeys = (value, keys) => plain(value)
    && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
  const finiteVec3 = (value) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  const current = (options) => {
    if (options.signal.aborted || !options.isOperationCurrent()) {
      throw createYueEError("YUE_E_ENTER_ABORTED");
    }
  };

  function assertManifest(value) {
    const numeric = ["byteLength", "heightMeters", "triangleCount", "boneCount", "wingPanelCount", "bodyMaxRadialDistance", "bindPoseMaxResidual"];
    const bounds = value?.bodyBounds;
    const probes = value?.exportedPoseProbes;
    if (!exactKeys(value, MANIFEST_KEYS)
      || value.version !== 1
      || value.profile !== "phase-1-lookdev"
      || !numeric.every((key) => Number.isFinite(value[key]) && value[key] >= 0)
      || !Number.isInteger(value.byteLength) || value.byteLength <= 0
      || !Number.isInteger(value.triangleCount) || !Number.isInteger(value.boneCount)
      || value.boneCount !== 39 || value.wingPanelCount !== 12
      || !exactKeys(bounds, ["min", "max"]) || !finiteVec3(bounds.min) || !finiteVec3(bounds.max)
      || !Array.isArray(value.lod0SemanticIds)
      || value.lod0SemanticIds.length === 0
      || !value.lod0SemanticIds.every((id) => typeof id === "string" && id.startsWith("yue-e.lod0."))
      || new Set(value.lod0SemanticIds).size !== value.lod0SemanticIds.length
      || !Array.isArray(probes) || probes.length === 0
      || !probes.every((probe) => exactKeys(probe, ["bone", "passed", "movedVertexCount", "maxMovedMeters", "controlMaxMovedMeters"])
        && typeof probe.bone === "string" && probe.passed === true
        && Number.isInteger(probe.movedVertexCount) && probe.movedVertexCount > 0
        && Number.isFinite(probe.maxMovedMeters) && Number.isFinite(probe.controlMaxMovedMeters))
      || ![value.sha256, value.approvedModelSha256, value.approvedGateSha256,
        value.lookdevContractSha256, value.rigFingerprintSha256,
        value.approvedLod0FingerprintSha256].every((hash) => UPPER_SHA.test(hash))) {
      throw createYueEError("YUE_E_ASSET_CONTRACT");
    }
    if (value.sha256 !== value.approvedModelSha256) throw createYueEError("YUE_E_ASSET_HASH");
    return Object.freeze(value);
  }
  ```

- [ ] **Step 6: Implement exact same-origin URL resolution.**

  Append:

  ```js
  function assertManifestRequest(manifestUrl, documentUrl) {
    let resolved;
    try { resolved = new URL(manifestUrl, documentUrl); }
    catch { throw createYueEError("YUE_E_ASSET_URL"); }
    const document = new URL(documentUrl);
    if (resolved.origin !== document.origin
      || resolved.pathname !== "/assets/yue-e/character/yue-e-traveler-lookdev.manifest.json"
      || resolved.search || resolved.hash) {
      throw createYueEError("YUE_E_ASSET_URL");
    }
    return resolved;
  }

  function resolveAsset(manifest, responseUrl, requestedManifest) {
    const basename = `yue-e-traveler-lookdev.${manifest.sha256.slice(0, 12)}.glb`;
    if (manifest.assetUrl !== `./${basename}`
      || /%2f|%5c|\\/iu.test(manifest.assetUrl)) {
      throw createYueEError("YUE_E_ASSET_URL");
    }
    const manifestBase = assertManifestRequest(responseUrl || requestedManifest.href, requestedManifest.href);
    const asset = new URL(manifest.assetUrl, manifestBase);
    if (asset.origin !== requestedManifest.origin
      || asset.pathname !== `/assets/yue-e/character/${basename}`
      || asset.search || asset.hash) {
      throw createYueEError("YUE_E_ASSET_URL");
    }
    return asset;
  }

  function assertFinalAssetUrl(responseUrl, expected) {
    const finalUrl = new URL(responseUrl || expected.href, expected.href);
    if (finalUrl.href !== expected.href) throw createYueEError("YUE_E_ASSET_URL");
  }

  const uppercaseDigest = async (cryptoSubtle, bytes) => {
    const digest = await cryptoSubtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0"))
      .join("").toUpperCase();
  };
  ```

- [ ] **Step 7: Implement the fetch/status/body/digest sequence.**

  Complete `asset-gate.js` with:

  ```js
  export async function fetchApprovedTravelerBytes(options) {
    try {
      current(options);
      const requestedManifest = assertManifestRequest(options.manifestUrl, options.documentUrl);
      const manifestResponse = await options.fetch(requestedManifest.href, { signal: options.signal, cache: "no-store" });
      current(options);
      if (!manifestResponse.ok) throw createYueEError("YUE_E_ASSET_NETWORK");
      assertManifestRequest(manifestResponse.url || requestedManifest.href, options.documentUrl);
      const manifestText = await manifestResponse.text();
      current(options);
      let parsed;
      try { parsed = JSON.parse(manifestText); }
      catch { throw createYueEError("YUE_E_ASSET_CONTRACT"); }
      const manifest = assertManifest(parsed);
      const asset = resolveAsset(manifest, manifestResponse.url, requestedManifest);
      const assetResponse = await options.fetch(asset.href, { signal: options.signal, cache: "force-cache" });
      current(options);
      if (!assetResponse.ok) throw createYueEError("YUE_E_ASSET_NETWORK");
      assertFinalAssetUrl(assetResponse.url, asset);
      const arrayBuffer = await assetResponse.arrayBuffer();
      current(options);
      if (arrayBuffer.byteLength !== manifest.byteLength) throw createYueEError("YUE_E_ASSET_HASH");
      const sha256 = await uppercaseDigest(options.cryptoSubtle, arrayBuffer);
      current(options);
      if (sha256 !== manifest.sha256) throw createYueEError("YUE_E_ASSET_HASH");
      return Object.freeze({
        manifest,
        assetUrl: asset.href,
        basePath: new URL("./", asset).href,
        arrayBuffer,
        sha256
      });
    } catch (error) {
      throw toSafeYueEError(error, "YUE_E_ASSET_NETWORK");
    }
  }
  ```

- [ ] **Step 8: Run byte-gate tests to GREEN and syntax-check.**

  Run:

  ```powershell
  node scripts/check-yue-e-asset-gate.mjs
  node --check web/yue-e/assets/asset-gate.js
  ```

  Expected: six TAP subtests pass; 503 reads zero body bytes; no thrown message contains a URL or hash.

- [ ] **Step 9: Commit the pre-parse asset gate.**

  ```powershell
  git add web/yue-e/assets/asset-gate.js scripts/check-yue-e-asset-gate.mjs
  git diff --cached --check
  git commit -m "feat: gate Yue E runtime asset bytes"
  ```

---

### Task 6: Parse the approved traveler and own only traveler resources

**Files:**

- Create: `web/yue-e/character/lookdev-loader.js`
- Modify: `scripts/check-yue-e-asset-gate.mjs`

**Interfaces:**

- `loadApprovedTraveler({ manifestUrl, documentUrl, fetch, cryptoSubtle, ensureGltfLoader, three, signal, isOperationCurrent }) -> Promise<TravelerHandle>`.
- `disposeTravelerScene(scene)` is exported for deterministic late-result and handle cleanup tests.
- The byte SHA is verified before `ensureGltfLoader()` and `GLTFLoader.parse()`; loader construction has no module-global rejected-promise cache.

- [ ] **Step 1: Add a structurally valid synthetic traveler factory to the asset checker.**

  Append these imports and helpers to `scripts/check-yue-e-asset-gate.mjs`:

  ```js
  import * as THREE from "three";
  import {
    REQUIRED_BONES,
    REQUIRED_BONE_PARENTS,
    YUE_E_LOOKDEV
  } from "../web/yue-e/character/lookdev-contract.js";
  import { loadApprovedTraveler } from "../web/yue-e/character/lookdev-loader.js";

  const materialNames = Object.keys(YUE_E_LOOKDEV.materials).sort();

  function syntheticTraveler() {
    const scene = new THREE.Group();
    const bones = new Map(REQUIRED_BONES.map((name) => [name, Object.assign(new THREE.Bone(), { name })]));
    for (const name of REQUIRED_BONES) {
      const parentName = REQUIRED_BONE_PARENTS[name];
      (parentName === null ? scene : bones.get(parentName)).add(bones.get(name));
    }
    const bodyGeometry = new THREE.BufferGeometry();
    bodyGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
      -0.30, 0, -0.20, 0.30, 0, -0.20, -0.30, 1.35, 0.20, 0.30, 1.35, 0.20
    ], 3));
    const semanticIds = [];
    const makeMesh = (name, materialName, region, geometry = bodyGeometry.clone(), skinned = false) => {
      const material = new THREE.MeshStandardMaterial();
      material.name = materialName;
      const mesh = skinned ? new THREE.SkinnedMesh(geometry, material) : new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.userData = { yueERegion: region, yueELod: 0, yueESemanticId: `yue-e.lod0.${name}` };
      semanticIds.push(mesh.userData.yueESemanticId);
      scene.add(mesh);
      return mesh;
    };
    const body = makeMesh("body", materialNames[0], "body", bodyGeometry, true);
    body.bind(new THREE.Skeleton([...bones.values()]));
    for (const [index, name] of materialNames.slice(1).entries()) {
      makeMesh(`body-material-${index + 1}`, name, name === "YE_Gravity_Tool" ? "tool" : "body");
    }
    for (let index = 1; index <= 12; index += 1) {
      makeMesh(`wing-${String(index).padStart(2, "0")}`, "YE_Wing_Glass", "wing");
    }
    const marker = new THREE.Object3D();
    marker.name = "ForwardMarker";
    marker.position.set(0, 0, -0.2);
    scene.add(marker);
    scene.updateMatrixWorld(true);
    return { scene, semanticIds: semanticIds.sort() };
  }

  function manifestFor(sceneFixture) {
    return {
      ...manifest,
      bodyMaxRadialDistance: Math.hypot(0.30, 0.20),
      lod0SemanticIds: sceneFixture.semanticIds
    };
  }
  ```

- [ ] **Step 2: Add SHA-before-parse, lazy-loader retry and structural acceptance tests.**

  Append:

  ```js
  test("loader is awaited only after SHA and a rejected initialization can retry", async () => {
    let ensureCalls = 0;
    let parseCalls = 0;
    class Loader {
      parse(_bytes, _basePath, onLoad) {
        parseCalls += 1;
        const fixture = syntheticTraveler();
        onLoad({ scene: fixture.scene, animations: [] });
      }
    }
    const fixture = syntheticTraveler();
    const runtimeManifest = manifestFor(fixture);
    const fetch = async (url) => String(url) === manifestUrl
      ? response(runtimeManifest, manifestUrl)
      : response(bytes, assetUrl);
    const common = {
      manifestUrl, documentUrl, fetch, cryptoSubtle: webcrypto.subtle, three: THREE,
      signal: new AbortController().signal, isOperationCurrent: () => true,
      ensureGltfLoader: async () => {
        ensureCalls += 1;
        if (ensureCalls === 1) throw new Error("first initialization failed");
        return Loader;
      }
    };
    await assert.rejects(loadApprovedTraveler(common), (error) => error.code === "YUE_E_ASSET_PARSE");
    const handle = await loadApprovedTraveler(common);
    assert.equal(ensureCalls, 2);
    assert.equal(parseCalls, 1);
    assert.equal(handle.assetSha256, sha);
    assert.equal(handle.report.boneCount, 39);
    assert.equal(handle.report.wingPanelCount, 12);
    handle.dispose();
    handle.dispose();
  });

  test("hash mismatch never initializes or calls GLTFLoader", async () => {
    let ensureCalls = 0;
    const changedBytes = new TextEncoder().encode("wrong-length-and-hash");
    await assert.rejects(loadApprovedTraveler({
      manifestUrl,
      documentUrl,
      fetch: approvedFetch({ assetResponse: response(changedBytes, assetUrl) }),
      cryptoSubtle: webcrypto.subtle,
      three: THREE,
      signal: new AbortController().signal,
      isOperationCurrent: () => true,
      ensureGltfLoader: async () => { ensureCalls += 1; return class {}; }
    }), (error) => error.code === "YUE_E_ASSET_HASH");
    assert.equal(ensureCalls, 0);
  });
  ```

- [ ] **Step 3: Add malformed animation/hierarchy and late-result disposal tests.**

  Append:

  ```js
  test("non-empty animations and malformed hierarchy fail the runtime contract", async () => {
    for (const mutate of [
      (gltf) => { gltf.animations = [{ name: "unapproved" }]; },
      (gltf) => {
        const head = gltf.scene.getObjectByName("Head");
        head.removeFromParent();
        gltf.scene.add(head);
      }
    ]) {
      const fixture = syntheticTraveler();
      const runtimeManifest = manifestFor(fixture);
      class Loader {
        parse(_bytes, _basePath, onLoad) {
          const current = syntheticTraveler();
          const gltf = { scene: current.scene, animations: [] };
          mutate(gltf);
          onLoad(gltf);
        }
      }
      await assert.rejects(loadApprovedTraveler({
        manifestUrl,
        documentUrl,
        fetch: async (url) => String(url) === manifestUrl
          ? response(runtimeManifest, manifestUrl)
          : response(bytes, assetUrl),
        cryptoSubtle: webcrypto.subtle,
        ensureGltfLoader: async () => Loader,
        three: THREE,
        signal: new AbortController().signal,
        isOperationCurrent: () => true
      }), (error) => error.code === "YUE_E_ASSET_CONTRACT");
    }
  });

  test("a parse callback arriving after abort disposes the unseen scene", async () => {
    const fixture = syntheticTraveler();
    const runtimeManifest = manifestFor(fixture);
    let deliver;
    let markParseStarted;
    const parseStarted = new Promise((resolve) => { markParseStarted = resolve; });
    let disposed = 0;
    class Loader {
      parse(_bytes, _basePath, onLoad) { deliver = onLoad; markParseStarted(); }
    }
    const controller = new AbortController();
    const pending = loadApprovedTraveler({
      manifestUrl,
      documentUrl,
      fetch: async (url) => String(url) === manifestUrl
        ? response(runtimeManifest, manifestUrl)
        : response(bytes, assetUrl),
      cryptoSubtle: webcrypto.subtle,
      ensureGltfLoader: async () => Loader,
      three: THREE,
      signal: controller.signal,
      isOperationCurrent: () => !controller.signal.aborted
    });
    await parseStarted;
    controller.abort();
    const late = syntheticTraveler();
    late.scene.traverse((object) => object.geometry?.addEventListener("dispose", () => { disposed += 1; }));
    deliver({ scene: late.scene, animations: [] });
    await assert.rejects(pending, (error) => error.code === "YUE_E_ENTER_ABORTED");
    assert.ok(disposed > 0);
  });
  ```

- [ ] **Step 4: Run the extended checker and verify loader RED.**

  Run: `node scripts/check-yue-e-asset-gate.mjs`

  Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web/yue-e/character/lookdev-loader.js`; existing byte-gate cases remain parse-free.

- [ ] **Step 5: Implement idempotent traveler-only disposal.**

  Start `web/yue-e/character/lookdev-loader.js` with:

  ```js
  import { fetchApprovedTravelerBytes } from "../assets/asset-gate.js?v=20260821-yue-e-phase1-1";
  import { createYueEError, toSafeYueEError } from "../core/errors.js?v=20260821-yue-e-phase1-1";
  import {
    REQUIRED_BONES,
    REQUIRED_BONE_PARENTS,
    YUE_E_LOOKDEV
  } from "./lookdev-contract.js?v=20260821-yue-e-phase1-1";

  export function disposeTravelerScene(scene) {
    if (!scene || scene.userData?.yueEDisposed) return;
    scene.userData = { ...scene.userData, yueEDisposed: true };
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
    scene.removeFromParent();
  }

  const close = (actual, expected, epsilon = 0.001) => Math.abs(actual - expected) <= epsilon;
  const exactSet = (actual, expected) => actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
  const identityTransform = (object) => object.position.lengthSq() === 0
    && close(object.quaternion.x, 0) && close(object.quaternion.y, 0)
    && close(object.quaternion.z, 0) && close(object.quaternion.w, 1)
    && close(object.scale.x, 1) && close(object.scale.y, 1) && close(object.scale.z, 1);
  ```

- [ ] **Step 6: Implement structural/body-metric runtime validation.**

  Append:

  ```js
  function validateParsedTraveler(gltf, manifest, three) {
    if (!gltf?.scene?.traverse || !Array.isArray(gltf.animations) || gltf.animations.length !== 0) {
      throw createYueEError("YUE_E_ASSET_CONTRACT");
    }
    const scene = gltf.scene;
    if (!identityTransform(scene)) throw createYueEError("YUE_E_ASSET_CONTRACT");
    scene.updateMatrixWorld(true);
    const bones = new Map();
    const materials = new Set();
    const semanticIds = [];
    const bodyMin = new three.Vector3(Infinity, Infinity, Infinity);
    const bodyMax = new three.Vector3(-Infinity, -Infinity, -Infinity);
    const vertex = new three.Vector3();
    let bodyMaxRadialDistance = 0;
    let skinnedMeshCount = 0;
    let wingPanelCount = 0;

    scene.traverse((object) => {
      if (object.isBone) bones.set(object.name, object);
      if (!object.isMesh || object.visible === false) return;
      if (object.isSkinnedMesh) skinnedMeshCount += 1;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material?.name) materials.add(material.name);
      }
      const { yueERegion, yueELod, yueESemanticId } = object.userData ?? {};
      if (!["body", "wing", "tool"].includes(yueERegion)
        || yueELod !== 0
        || typeof yueESemanticId !== "string"
        || !yueESemanticId.startsWith(YUE_E_LOOKDEV.semanticIdPrefix)) {
        throw createYueEError("YUE_E_ASSET_CONTRACT");
      }
      semanticIds.push(yueESemanticId);
      if (yueERegion === "wing") wingPanelCount += 1;
      if (yueERegion !== "body") return;
      const position = object.geometry?.getAttribute?.("position");
      if (!position) throw createYueEError("YUE_E_ASSET_CONTRACT");
      for (let index = 0; index < position.count; index += 1) {
        vertex.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
        if (![vertex.x, vertex.y, vertex.z].every(Number.isFinite)) {
          throw createYueEError("YUE_E_ASSET_CONTRACT");
        }
        bodyMin.min(vertex);
        bodyMax.max(vertex);
        bodyMaxRadialDistance = Math.max(bodyMaxRadialDistance, Math.hypot(vertex.x, vertex.z));
      }
    });

    const expectedBones = [...REQUIRED_BONES].sort();
    if (!exactSet([...bones.keys()].sort(), expectedBones)) throw createYueEError("YUE_E_ASSET_CONTRACT");
    for (const name of REQUIRED_BONES) {
      const expectedParent = REQUIRED_BONE_PARENTS[name];
      const actualParent = bones.get(name).parent?.isBone ? bones.get(name).parent.name : null;
      if (actualParent !== expectedParent) throw createYueEError("YUE_E_ASSET_CONTRACT");
    }
    const rootBone = bones.get("Root");
    if (!identityTransform(rootBone) || skinnedMeshCount < 1) throw createYueEError("YUE_E_ASSET_CONTRACT");
    if (!exactSet([...materials].sort(), Object.keys(YUE_E_LOOKDEV.materials).sort())) {
      throw createYueEError("YUE_E_ASSET_CONTRACT");
    }
    semanticIds.sort();
    if (new Set(semanticIds).size !== semanticIds.length
      || !exactSet(semanticIds, [...manifest.lod0SemanticIds].sort())
      || wingPanelCount !== manifest.wingPanelCount) {
      throw createYueEError("YUE_E_ASSET_CONTRACT");
    }
    const expectedBounds = manifest.bodyBounds;
    const actualBounds = { min: bodyMin.toArray(), max: bodyMax.toArray() };
    if (!actualBounds.min.every((value, index) => close(value, expectedBounds.min[index]))
      || !actualBounds.max.every((value, index) => close(value, expectedBounds.max[index]))
      || !close(bodyMaxRadialDistance, manifest.bodyMaxRadialDistance)
      || !close(bodyMin.y, 0, 0.005)
      || Math.abs((bodyMin.x + bodyMax.x) / 2) > 0.01
      || Math.abs((bodyMin.z + bodyMax.z) / 2) > 0.01
      || !close(bodyMax.y - bodyMin.y, manifest.heightMeters)) {
      throw createYueEError("YUE_E_ASSET_CONTRACT");
    }
    const forward = scene.getObjectByName("ForwardMarker");
    const forwardWorld = forward?.getWorldPosition(new three.Vector3());
    if (!forwardWorld || forwardWorld.z >= 0 || Math.abs(forwardWorld.x) > 0.01) {
      throw createYueEError("YUE_E_ASSET_CONTRACT");
    }
    return Object.freeze({
      heightMeters: manifest.heightMeters,
      triangleCount: manifest.triangleCount,
      boneCount: bones.size,
      wingPanelCount,
      bodyBounds: Object.freeze({ min: Object.freeze(actualBounds.min), max: Object.freeze(actualBounds.max) }),
      bodyMaxRadialDistance,
      lod0SemanticIds: Object.freeze(semanticIds),
      bindPoseMaxResidual: manifest.bindPoseMaxResidual,
      exportedPoseProbes: Object.freeze(manifest.exportedPoseProbes),
      rigFingerprintSha256: manifest.rigFingerprintSha256,
      approvedLod0FingerprintSha256: manifest.approvedLod0FingerprintSha256
    });
  }
  ```

  The two fingerprints and five passed pose probes are accepted only after promotion re-computed them, the runtime manifest preserved them, and the complete GLB SHA matches `approvedModelSha256`; the parsed hierarchy/material/semantic/body checks above independently reject a loader result that does not represent those bytes.

- [ ] **Step 7: Implement abort-safe parse orchestration and the handle.**

  Complete `lookdev-loader.js` with:

  ```js
  const stillCurrent = (options) => {
    if (options.signal.aborted || !options.isOperationCurrent()) throw createYueEError("YUE_E_ENTER_ABORTED");
  };

  function parseGltf(Loader, bytes, basePath) {
    return new Promise((resolve, reject) => {
      try {
        new Loader().parse(bytes, basePath, resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  export async function loadApprovedTraveler(options) {
    let parsedScene = null;
    try {
      const gated = await fetchApprovedTravelerBytes(options);
      stillCurrent(options);
      const Loader = await options.ensureGltfLoader();
      stillCurrent(options);
      const gltf = await parseGltf(Loader, gated.arrayBuffer, gated.basePath);
      parsedScene = gltf?.scene ?? null;
      stillCurrent(options);
      const report = validateParsedTraveler(gltf, gated.manifest, options.three);
      let disposed = false;
      return Object.freeze({
        scene: parsedScene,
        report,
        assetSha256: gated.sha256,
        dispose() {
          if (disposed) return;
          disposed = true;
          disposeTravelerScene(parsedScene);
        }
      });
    } catch (error) {
      if (parsedScene) disposeTravelerScene(parsedScene);
      const fallback = error?.code === "YUE_E_ENTER_ABORTED" ? "YUE_E_ENTER_ABORTED"
        : error?.code === "YUE_E_ASSET_CONTRACT" ? "YUE_E_ASSET_CONTRACT"
          : "YUE_E_ASSET_PARSE";
      throw toSafeYueEError(error, fallback);
    }
  }
  ```

- [ ] **Step 8: Run all asset/parse tests to GREEN.**

  Run:

  ```powershell
  node scripts/check-yue-e-asset-gate.mjs
  node --check web/yue-e/character/lookdev-loader.js
  ```

  Expected: ten TAP subtests pass; first loader initialization rejects, the same caller retries successfully, hash mismatch yields zero loader calls, and late parsed resources emit disposal events.

- [ ] **Step 9: Commit the traveler handle boundary.**

  ```powershell
  git add web/yue-e/character/lookdev-loader.js scripts/check-yue-e-asset-gate.mjs
  git diff --cached --check
  git commit -m "feat: load approved Yue E traveler"
  ```

---

### Task 7: Build typed inert collision, music-zone anchors and the empty shell scene

**Files:**

- Create: `web/yue-e/world/phase-1-collision.js`
- Create: `web/yue-e/music-zone/anchors.js`
- Create: `web/yue-e/scene/shell-scene.js`
- Create: `scripts/check-yue-e-shell-scene.mjs`

**Interfaces:**

- `createPhase1Collision(TravelerReport) -> CollisionReadiness` uses only approved body metrics; wings/tool never enter the computation.
- `createMusicZoneAnchors(three) -> AnchorRegistry` owns five invisible Object3D transforms and no DOM.
- `createShellScene({ three, canvas, createRenderer, devicePixelRatio, resizeObserverFactory, traveler, collision, anchors }) -> ShellScene` never schedules RAF and never disposes traveler resources.
- `composeFirstFrameReadiness(parts) -> ShellReadiness` is the pure six-boolean audit seam.

- [ ] **Step 1: Write 1.30m/1.40m collision and invalid-input tests.**

  Create `scripts/check-yue-e-shell-scene.mjs` with:

  ```js
  import assert from "node:assert/strict";
  import test from "node:test";
  import * as THREE from "three";
  import { createPhase1Collision } from "../web/yue-e/world/phase-1-collision.js";
  import { createMusicZoneAnchors } from "../web/yue-e/music-zone/anchors.js";
  import { composeFirstFrameReadiness, createShellScene } from "../web/yue-e/scene/shell-scene.js";

  const report = (heightMeters, bodyMaxRadialDistance, centerX = 0, centerZ = 0) => ({
    heightMeters,
    bodyMaxRadialDistance,
    bodyBounds: {
      min: [centerX - 0.3, 0, centerZ - 0.2],
      max: [centerX + 0.3, heightMeters, centerZ + 0.2]
    }
  });

  test("capsule uses true body radius, touches floor/top and reports overhang", () => {
    const compact = createPhase1Collision(report(1.30, 0.21));
    assert.equal(compact.radius, 0.24);
    assert.deepEqual(compact.segmentStart, [0, 0.24, 0]);
    assert.deepEqual(compact.segmentEnd, [0, 1.06, 0]);
    assert.equal(compact.visualOverhangMeters, 0);
    const broad = createPhase1Collision(report(1.40, 0.41));
    assert.equal(broad.radius, 0.36);
    assert.deepEqual(broad.segmentEnd, [0, 1.04, 0]);
    assert.ok(Math.abs(broad.visualOverhangMeters - 0.05) < 1e-12);
    assert.equal(broad.source, "approved-body-metrics");
  });

  test("capsule rejects non-finite, off-axis and too-short body metrics", () => {
    for (const input of [report(NaN, 0.3), report(1.35, Infinity), report(1.35, 0.3, 0.021), report(0.6, 0.4)]) {
      assert.throws(() => createPhase1Collision(input), (error) => error.code === "YUE_E_ASSET_CONTRACT");
    }
  });
  ```

- [ ] **Step 2: Add exact anchor position/orientation tests.**

  Append:

  ```js
  test("anchor registry has one respawn and four elevated 45-degree UI anchors", () => {
    const anchors = createMusicZoneAnchors(THREE);
    const expected = {
      respawn: [0, 0, 0],
      presetGallery: [-8, 8, -12],
      playlist: [8, 8, -12],
      functionDock: [13, 7, -10],
      overlay: [0, 9, -16]
    };
    assert.deepEqual(anchors.ids, Object.keys(expected));
    assert.equal(new Set(anchors.entries().map(([, object]) => object.uuid)).size, 5);
    for (const [id, position] of Object.entries(expected)) {
      const object = anchors.get(id);
      assert.deepEqual(object.position.toArray(), position);
      if (id === "respawn") continue;
      assert.ok(position[1] >= 6 && position[1] <= 10);
      assert.ok(Math.abs(object.rotation.x + Math.PI / 4) < 1e-12);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(object.quaternion);
      const towardOrigin = new THREE.Vector3(-position[0], 0, -position[2]).normalize();
      assert.ok(new THREE.Vector3(forward.x, 0, forward.z).normalize().dot(towardOrigin) > 0.999);
      assert.ok(forward.y < 0);
    }
    assert.deepEqual(anchors.readiness(), { anchors: true });
    assert.throws(() => anchors.get("missing"), (error) => error.code === "YUE_E_RESOURCE_UNKNOWN");
    anchors.dispose();
    assert.deepEqual(anchors.readiness(), { anchors: false });
  });
  ```

- [ ] **Step 3: Add six-input readiness and r185 shell tests with a fake renderer.**

  Append:

  ```js
  class FakeRenderer {
    constructor(colorApi = "r185") {
      this.shadowMap = {};
      this.domElement = {};
      this.renderCalls = 0;
      this.disposeCalls = 0;
      this.forceContextLossCalls = 0;
      if (colorApi === "r185") this.outputColorSpace = null;
      else this.outputEncoding = null;
    }
    setPixelRatio(value) { this.pixelRatio = value; }
    setSize(width, height) { this.size = [width, height]; }
    setClearColor(color, alpha) { this.clear = [color, alpha]; }
    render(scene, camera) { this.renderCalls += 1; this.lastScene = scene; this.lastCamera = camera; }
    dispose() { this.disposeCalls += 1; }
    forceContextLoss() { this.forceContextLossCalls += 1; }
  }

  const fakeCanvas = () => ({ clientWidth: 960, clientHeight: 540 });
  const fakeObserverFactory = (ledger) => (callback) => ({
    observe(target) { ledger.observed = target; ledger.callback = callback; },
    disconnect() { ledger.disconnects += 1; }
  });

  test("firstFrameSafe is the conjunction of exactly six readiness inputs", () => {
    const names = ["terrain", "collision", "character", "anchors", "renderer", "frame"];
    assert.equal(composeFirstFrameReadiness(Object.fromEntries(names.map((name) => [name, true]))).firstFrameSafe, true);
    for (const falseName of names) {
      const input = Object.fromEntries(names.map((name) => [name, name !== falseName]));
      assert.equal(composeFirstFrameReadiness(input).firstFrameSafe, false);
    }
  });

  test("empty shell is authored 3D, owns no RAF and keeps traveler disposal separate", () => {
    const renderers = [];
    const observerLedger = { disconnects: 0 };
    const travelerScene = new THREE.Group();
    travelerScene.name = "ApprovedTraveler";
    const travelerGeometry = new THREE.BoxGeometry(0.2, 1.35, 0.2);
    const travelerMaterial = new THREE.MeshStandardMaterial();
    const travelerMesh = new THREE.Mesh(travelerGeometry, travelerMaterial);
    travelerScene.add(travelerMesh);
    let travelerDisposals = 0;
    travelerGeometry.addEventListener("dispose", () => { travelerDisposals += 1; });
    const anchors = createMusicZoneAnchors(THREE);
    const shell = createShellScene({
      three: THREE,
      canvas: fakeCanvas(),
      createRenderer: () => { const renderer = new FakeRenderer("r185"); renderers.push(renderer); return renderer; },
      devicePixelRatio: () => 3,
      resizeObserverFactory: fakeObserverFactory(observerLedger),
      traveler: { scene: travelerScene },
      collision: createPhase1Collision(report(1.35, 0.29)),
      anchors
    });
    assert.equal(shell.readiness().frame, false);
    shell.renderFrame(16, 0.016);
    assert.equal(shell.readiness().firstFrameSafe, true);
    assert.equal(renderers[0].pixelRatio, 2);
    assert.deepEqual(renderers[0].size, [960, 540]);
    assert.equal(renderers[0].outputColorSpace, THREE.SRGBColorSpace);
    assert.equal(renderers[0].lastCamera.fov, 50);
    assert.ok(Math.abs(renderers[0].lastCamera.position.z - 3.4) < 1e-12);
    assert.equal(renderers[0].lastScene.getObjectByName("MusicZoneRespawn") !== undefined, true);
    assert.equal(renderers[0].lastScene.getObjectByName("Phase1StoneMarker1") !== undefined, true);
    assert.equal(renderers[0].lastScene.getObjectByName("ApprovedTraveler"), travelerScene);
    assert.deepEqual(travelerScene.position.toArray(), [0, 0, 0]);
    assert.deepEqual(travelerScene.scale.toArray(), [1, 1, 1]);
    assert.equal(shell.diagnostics().rendererCount, 1);
    shell.dispose();
    assert.equal(travelerDisposals, 0);
    assert.equal(observerLedger.disconnects, 1);
    travelerGeometry.dispose();
    travelerMaterial.dispose();
    anchors.dispose();
  });
  ```

- [ ] **Step 4: Add r128 color and context-lost rebuild ledger tests.**

  Append:

  ```js
  test("r128 encoding branch and context-lost rebuild never force-loss the lost renderer", async () => {
    const renderers = [];
    const observerLedger = { disconnects: 0 };
    const anchors = createMusicZoneAnchors(THREE);
    const threeR128 = { ...THREE, sRGBEncoding: 3001, SRGBColorSpace: undefined };
    const shell = createShellScene({
      three: threeR128,
      canvas: fakeCanvas(),
      createRenderer: () => { const renderer = new FakeRenderer("r128"); renderers.push(renderer); return renderer; },
      devicePixelRatio: () => 1,
      resizeObserverFactory: fakeObserverFactory(observerLedger),
      traveler: { scene: new THREE.Group() },
      collision: createPhase1Collision(report(1.35, 0.29)),
      anchors
    });
    assert.equal(renderers[0].outputEncoding, 3001);
    assert.deepEqual(await shell.rebuildRenderer({ previousContextLost: true }), { rendererGeneration: 2 });
    assert.equal(renderers[0].disposeCalls, 1);
    assert.equal(renderers[0].forceContextLossCalls, 0);
    assert.equal(shell.diagnostics().rendererCount, 2);
    assert.equal(shell.diagnostics().loseContextCalls, 0);
    shell.dispose();
    assert.equal(renderers[1].forceContextLossCalls, 1);
    assert.equal(shell.diagnostics().loseContextCalls, 1);
    anchors.dispose();
  });
  ```

- [ ] **Step 5: Run shell checks and record the three-module RED.**

  Run: `node scripts/check-yue-e-shell-scene.mjs`

  Expected: FAIL on the first missing production import; no fake renderer has run yet.

- [ ] **Step 6: Implement collision from true approved body metrics.**

  Create `web/yue-e/world/phase-1-collision.js`:

  ```js
  import { createYueEError } from "../core/errors.js?v=20260821-yue-e-phase1-1";

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  export function createPhase1Collision(report) {
    const { heightMeters, bodyMaxRadialDistance, bodyBounds } = report ?? {};
    const values = [heightMeters, bodyMaxRadialDistance, ...(bodyBounds?.min ?? []), ...(bodyBounds?.max ?? [])];
    if (values.length !== 8 || !values.every(Number.isFinite)
      || bodyBounds.min.some((value, index) => value > bodyBounds.max[index])) {
      throw createYueEError("YUE_E_ASSET_CONTRACT");
    }
    const centerX = (bodyBounds.min[0] + bodyBounds.max[0]) / 2;
    const centerZ = (bodyBounds.min[2] + bodyBounds.max[2]) / 2;
    const radius = clamp(bodyMaxRadialDistance + 0.02, 0.24, 0.36);
    if (Math.abs(centerX) > 0.02 || Math.abs(centerZ) > 0.02
      || Math.abs(bodyBounds.min[1]) > 0.005
      || Math.abs(bodyBounds.max[1] - heightMeters) > 0.001
      || heightMeters <= 2 * radius) {
      throw createYueEError("YUE_E_ASSET_CONTRACT");
    }
    return Object.freeze({
      ready: true,
      kind: "capsule",
      radius,
      segmentStart: Object.freeze([centerX, radius, centerZ]),
      segmentEnd: Object.freeze([centerX, heightMeters - radius, centerZ]),
      bodyCenterXZ: Object.freeze([centerX, centerZ]),
      visualOverhangMeters: Math.max(0, bodyMaxRadialDistance - radius),
      source: "approved-body-metrics"
    });
  }
  ```

- [ ] **Step 7: Implement the fixed invisible anchor registry.**

  Create `web/yue-e/music-zone/anchors.js`:

  ```js
  import { createYueEError } from "../core/errors.js?v=20260821-yue-e-phase1-1";

  const DEFINITIONS = Object.freeze([
    ["respawn", [0, 0, 0]],
    ["presetGallery", [-8, 8, -12]],
    ["playlist", [8, 8, -12]],
    ["functionDock", [13, 7, -10]],
    ["overlay", [0, 9, -16]]
  ]);

  export function createMusicZoneAnchors(three) {
    let disposed = false;
    const entries = DEFINITIONS.map(([id, position]) => {
      const object = new three.Object3D();
      object.name = `YueEAnchor:${id}`;
      object.position.fromArray(position);
      if (id !== "respawn") {
        object.rotation.order = "YXZ";
        object.rotation.y = Math.atan2(position[0], position[2]);
        object.rotation.x = -Math.PI / 4;
      }
      object.updateMatrix();
      return Object.freeze([id, object]);
    });
    const byId = new Map(entries);
    const ids = Object.freeze(entries.map(([id]) => id));
    return Object.freeze({
      version: 1,
      ids,
      get(id) {
        const object = byId.get(id);
        if (!object) throw createYueEError("YUE_E_RESOURCE_UNKNOWN");
        return object;
      },
      entries: () => Object.freeze([...entries]),
      readiness: () => Object.freeze({ anchors: !disposed && byId.size === 5 }),
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const object of byId.values()) object.removeFromParent();
        byId.clear();
      }
    });
  }
  ```

- [ ] **Step 8: Implement the pure readiness seam and renderer factory.**

  Start `web/yue-e/scene/shell-scene.js` with:

  ```js
  import { createYueEError } from "../core/errors.js?v=20260821-yue-e-phase1-1";

  const READINESS_KEYS = Object.freeze(["terrain", "collision", "character", "anchors", "renderer", "frame"]);

  export function composeFirstFrameReadiness(parts) {
    const result = Object.fromEntries(READINESS_KEYS.map((key) => [key, parts[key] === true]));
    result.firstFrameSafe = READINESS_KEYS.every((key) => result[key]);
    return Object.freeze(result);
  }

  function configureRenderer(three, renderer, pixelRatio, width, height) {
    renderer.setPixelRatio(Math.min(2, Math.max(1, pixelRatio)));
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    renderer.setClearColor(0xD8D2C3, 1);
    renderer.shadowMap.enabled = true;
    if (three.PCFSoftShadowMap !== undefined) renderer.shadowMap.type = three.PCFSoftShadowMap;
    if ("outputColorSpace" in renderer && three.SRGBColorSpace !== undefined) {
      renderer.outputColorSpace = three.SRGBColorSpace;
    } else if ("outputEncoding" in renderer && three.sRGBEncoding !== undefined) {
      renderer.outputEncoding = three.sRGBEncoding;
    }
    if (three.ACESFilmicToneMapping !== undefined) renderer.toneMapping = three.ACESFilmicToneMapping;
  }
  ```

- [ ] **Step 9: Implement the authored empty music-zone geometry and lights.**

  Append inside `shell-scene.js`:

  ```js
  function buildOwnedWorld(three, ownGeometry, ownMaterial) {
    const world = new three.Group();
    world.name = "YueEPhase1MusicZone";
    const groundGeometry = ownGeometry(new three.CircleGeometry(22, 64));
    const groundPositions = groundGeometry.getAttribute("position");
    for (let index = 0; index < groundPositions.count; index += 1) {
      const x = groundPositions.getX(index);
      const y = groundPositions.getY(index);
      const radial = Math.min(1, Math.hypot(x, y) / 22);
      groundPositions.setZ(index, 0.05 * (1 - radial) * Math.sin(x * 0.55) * Math.cos(y * 0.45));
    }
    groundPositions.needsUpdate = true;
    groundGeometry.computeVertexNormals();
    const groundMaterial = ownMaterial(new three.MeshStandardMaterial({ color: 0xD9D2BF, roughness: 0.92 }));
    const ground = new three.Mesh(groundGeometry, groundMaterial);
    ground.name = "Phase1IvoryStoneGround";
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    world.add(ground);

    const ringGeometry = ownGeometry(new three.TorusGeometry(1.7, 0.09, 16, 64));
    const ringMaterial = ownMaterial(new three.MeshStandardMaterial({
      color: 0xFFC968,
      emissive: 0xFFC968,
      emissiveIntensity: 0.72,
      roughness: 0.35
    }));
    const ring = new three.Mesh(ringGeometry, ringMaterial);
    ring.name = "MusicZoneRespawn";
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.04;
    world.add(ring);

    const markerMaterial = ownMaterial(new three.MeshStandardMaterial({ color: 0x8A94A3, roughness: 0.78 }));
    for (let index = 0; index < 3; index += 1) {
      const marker = new three.Mesh(ownGeometry(new three.DodecahedronGeometry(0.45 + index * 0.08, 0)), markerMaterial);
      marker.name = `Phase1StoneMarker${index + 1}`;
      marker.position.set((index - 1) * 4.5, 0.45, -5.5 - index * 1.5);
      marker.castShadow = true;
      marker.receiveShadow = true;
      world.add(marker);
    }
    return world;
  }
  ```

- [ ] **Step 10: Implement `createShellScene`, resize and render without RAF ownership.**

  Append:

  ```js
  export function createShellScene(options) {
    const { three } = options;
    let disposed = false;
    let renderer = null;
    let rendererGeneration = 0;
    let rendererCount = 0;
    let loseContextCalls = 0;
    let frameCount = 0;
    let inputEnabled = false;
    const rendererLedgers = [];
    const geometries = new Set();
    const materials = new Set();
    const ownGeometry = (value) => { geometries.add(value); return value; };
    const ownMaterial = (value) => { materials.add(value); return value; };
    const scene = new three.Scene();
    scene.name = "YueEPhase1Shell";
    scene.fog = new three.FogExp2(0xD8D2C3, 0.018);
    const camera = new three.PerspectiveCamera(50, 1, 0.05, 80);
    camera.position.set(0, 2.1, 3.4);
    camera.lookAt(0, 0.72, 0);
    const hemisphere = new three.HemisphereLight(0xEAF4FF, 0x6F6254, 1.35);
    hemisphere.name = "Phase1Hemisphere";
    const key = new three.DirectionalLight(0xFFD8B0, 2.1);
    key.name = "Phase1WarmKey";
    key.position.set(4, 7, 3);
    key.castShadow = true;
    const rim = new three.DirectionalLight(0x8BC8E8, 1.1);
    rim.name = "Phase1CoolRim";
    rim.position.set(-5, 4, -4);
    scene.add(hemisphere, key, rim, buildOwnedWorld(three, ownGeometry, ownMaterial));
    scene.add(options.traveler.scene);
    for (const [, anchor] of options.anchors.entries()) scene.add(anchor);

    const resize = () => {
      const width = Math.max(1, options.canvas.clientWidth || 1);
      const height = Math.max(1, options.canvas.clientHeight || 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (renderer) configureRenderer(three, renderer, options.devicePixelRatio(), width, height);
    };
    const createNextRenderer = () => {
      try { renderer = options.createRenderer(three, { canvas: options.canvas, antialias: true, alpha: false }); }
      catch { throw createYueEError("YUE_E_WEBGL_UNAVAILABLE"); }
      rendererGeneration += 1;
      rendererCount += 1;
      rendererLedgers.push({
        generation: rendererGeneration,
        disposed: false,
        previousContextLost: false,
        forceContextLossCalls: 0
      });
      resize();
    };
    createNextRenderer();
    const observer = options.resizeObserverFactory(resize);
    observer.observe(options.canvas);

    const currentReadiness = () => composeFirstFrameReadiness({
      terrain: !disposed && scene.getObjectByName("Phase1IvoryStoneGround") !== undefined,
      collision: !disposed && options.collision.ready === true,
      character: !disposed && options.traveler.scene.parent === scene,
      anchors: !disposed && options.anchors.readiness().anchors,
      renderer: !disposed && renderer !== null,
      frame: !disposed && frameCount > 0
    });
  ```

- [ ] **Step 11: Complete shell recovery, diagnostics and ownership-safe disposal.**

  Complete the function:

  ```js
    return Object.freeze({
      renderFrame(timeMs, dtSeconds) {
        if (disposed || !Number.isFinite(timeMs) || !Number.isFinite(dtSeconds)) {
          throw createYueEError("YUE_E_INVALID_TRANSITION");
        }
        renderer.render(scene, camera);
        frameCount += 1;
      },
      readiness: currentReadiness,
      setInputEnabled(enabled) { inputEnabled = enabled === true; },
      async rebuildRenderer({ previousContextLost }) {
        if (disposed || previousContextLost !== true) throw createYueEError("YUE_E_CONTEXT_REBUILD");
        const lostRenderer = renderer;
        renderer = null;
        lostRenderer.dispose();
        const ledger = rendererLedgers.at(-1);
        ledger.disposed = true;
        ledger.previousContextLost = true;
        frameCount = 0;
        createNextRenderer();
        return Object.freeze({ rendererGeneration });
      },
      diagnostics() {
        return Object.freeze({
          rendererGeneration,
          rendererCount,
          loseContextCalls,
          frameCount,
          inputEnabled,
          observerActive: !disposed,
          resources: Object.freeze({
            geometries: disposed ? 0 : geometries.size,
            materials: disposed ? 0 : materials.size,
            textures: 0,
            renderTargets: 0
          }),
          rendererLedgers: Object.freeze(rendererLedgers.map((entry) => Object.freeze({ ...entry })))
        });
      },
      dispose({ previousContextLost = false } = {}) {
        if (disposed) return;
        disposed = true;
        observer.disconnect();
        options.traveler.scene.removeFromParent();
        for (const [, anchor] of options.anchors.entries()) anchor.removeFromParent();
        for (const geometry of geometries) geometry.dispose();
        for (const material of materials) material.dispose();
        geometries.clear();
        materials.clear();
        if (renderer) {
          renderer.dispose();
          if (previousContextLost) {
            rendererLedgers.at(-1).previousContextLost = true;
          } else if (typeof renderer.forceContextLoss === "function") {
            renderer.forceContextLoss();
            loseContextCalls += 1;
            rendererLedgers.at(-1).forceContextLossCalls += 1;
          }
          rendererLedgers.at(-1).disposed = true;
        }
        renderer = null;
        scene.clear();
      }
    });
  }
  ```

- [ ] **Step 12: Run shell tests to GREEN and syntax-check.**

  Run:

  ```powershell
  node scripts/check-yue-e-shell-scene.mjs
  node --check web/yue-e/world/phase-1-collision.js
  node --check web/yue-e/music-zone/anchors.js
  node --check web/yue-e/scene/shell-scene.js
  ```

  Expected: six TAP subtests pass; r185/r128 color branches pass; lost renderer has zero forced-loss calls; shell disposal leaves traveler disposal count at zero.

- [ ] **Step 13: Commit the empty 3D shell.**

  ```powershell
  git add web/yue-e/world/phase-1-collision.js web/yue-e/music-zone/anchors.js web/yue-e/scene/shell-scene.js scripts/check-yue-e-shell-scene.mjs
  git diff --cached --check
  git commit -m "feat: add empty Yue E music-zone shell"
  ```

---

### Task 8: Recover WebGL context with a fake timer and same-runtime pose rule

**Files:**

- Create: `web/yue-e/core/context-recovery.js`
- Create: `scripts/check-yue-e-context-recovery.mjs`

**Interfaces:**

- `createContextRecovery(ContextRecoveryOptions) -> ContextRecoveryController` binds exactly `webglcontextlost` and `webglcontextrestored`.
- `isUsableRecoveryPose(pose, { runtimeId, now, maxPoseAgeMs }) -> boolean` is the only coordinate reuse rule.
- Recovery keeps the existing heavy-RAF lease, calls `stopRendering()` before rebuild, and resumes rendering only after a rebuilt renderer produces three healthy frames and the recovery fade completes.

- [ ] **Step 1: Write fake timer/event harnesses.**

  Create `scripts/check-yue-e-context-recovery.mjs` with:

  ```js
  import assert from "node:assert/strict";
  import test from "node:test";
  import { createContextRecovery, isUsableRecoveryPose } from "../web/yue-e/core/context-recovery.js";

  class FakeTimers {
    #next = 1;
    #callbacks = new Map();
    nowMs = 1000;
    now = () => this.nowMs;
    setTimer = (callback) => { const id = this.#next++; this.#callbacks.set(id, callback); return id; };
    clearTimer = (id) => { this.#callbacks.delete(id); };
    fire() {
      const callbacks = [...this.#callbacks.values()];
      this.#callbacks.clear();
      for (const callback of callbacks) callback();
    }
    count() { return this.#callbacks.size; }
  }

  class FakeTarget {
    #listeners = new Map();
    addEventListener(type, listener) {
      const listeners = this.#listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.#listeners.set(type, listeners);
    }
    removeEventListener(type, listener) { this.#listeners.get(type)?.delete(listener); }
    emit(type, event = {}) { for (const listener of this.#listeners.get(type) ?? []) listener(event); }
    count() { return [...this.#listeners.values()].reduce((total, listeners) => total + listeners.size, 0); }
  }

  function harness(overrides = {}) {
    const timers = new FakeTimers();
    const target = new FakeTarget();
    const calls = [];
    const failures = [];
    const controller = createContextRecovery({
      target,
      timers,
      runtimeId: "runtime-a",
      timeoutMs: 8000,
      maxPoseAgeMs: 10000,
      canRecover: () => true,
      stopRendering: () => calls.push("stop"),
      setInputEnabled: (enabled) => calls.push(`input:${enabled}`),
      capturePose: () => ({
        runtimeId: "runtime-a",
        logicalPosition: [1, 0, -2],
        logicalRotation: 0.25,
        movementMode: "ground",
        capturedAt: timers.now()
      }),
      applyPose: () => calls.push("apply-pose"),
      respawn: () => calls.push("respawn"),
      collisionReady: () => true,
      rebuildRenderer: async () => { calls.push("rebuild"); },
      renderStableFrames: async () => { calls.push("stable:3"); return { stableFrames: 3 }; },
      fadeIn: async () => { calls.push("fade"); },
      resumeRendering: () => calls.push("resume"),
      onPhase: (phase) => calls.push(`phase:${phase}`),
      onFailure: (error) => failures.push(error.code),
      ...overrides
    });
    return { controller, timers, target, calls, failures };
  }
  ```

- [ ] **Step 2: Add success, pose-expiry and wrong-runtime tests.**

  Append:

  ```js
  test("active context loss freezes, rebuilds, gates three frames and resumes", async () => {
    const h = harness();
    let prevented = 0;
    h.controller.handleLost({ preventDefault() { prevented += 1; } });
    assert.equal(prevented, 1);
    assert.equal(h.timers.count(), 1);
    assert.deepEqual(h.controller.snapshot(), { phase: "lost", generation: 1, hasVolatilePose: true });
    await h.controller.handleRestored();
    assert.deepEqual(h.calls, [
      "stop", "input:false", "phase:lost", "phase:rebuilding", "rebuild", "stable:3",
      "apply-pose", "phase:fading-in", "fade", "input:true", "resume", "phase:none"
    ]);
    assert.deepEqual(h.failures, []);
    assert.equal(h.timers.count(), 0);
  });

  test("expired or other-runtime volatile pose respawns", async () => {
    for (const pose of [
      { runtimeId: "runtime-b", logicalPosition: [1, 0, 1], logicalRotation: 0, movementMode: "ground", capturedAt: 1000 },
      { runtimeId: "runtime-a", logicalPosition: [1, 0, 1], logicalRotation: 0, movementMode: "ground", capturedAt: -10000 }
    ]) {
      const h = harness({ capturePose: () => pose });
      h.controller.handleLost({ preventDefault() {} });
      await h.controller.handleRestored();
      assert.equal(h.calls.includes("respawn"), true);
      assert.equal(h.calls.includes("apply-pose"), false);
    }
  });

  test("pose predicate rejects future, expired, malformed and foreign values", () => {
    const options = { runtimeId: "runtime-a", now: 5000, maxPoseAgeMs: 10000 };
    assert.equal(isUsableRecoveryPose({
      runtimeId: "runtime-a", logicalPosition: [0, 0, 0], logicalRotation: 0,
      movementMode: "ground", capturedAt: 4999
    }, options), true);
    assert.equal(isUsableRecoveryPose({
      runtimeId: "runtime-a", logicalPosition: [0, NaN, 0], logicalRotation: 0,
      movementMode: "ground", capturedAt: 4999
    }, options), false);
    assert.equal(isUsableRecoveryPose({
      runtimeId: "runtime-a", logicalPosition: [0, 0, 0], logicalRotation: 0,
      movementMode: "ground", capturedAt: 5001
    }, options), false);
  });
  ```

- [ ] **Step 3: Add timeout, rebuild failure and pre-active loss tests.**

  Append:

  ```js
  test("eight-second timeout fails once and ignores a late restore", async () => {
    const h = harness();
    h.controller.handleLost({ preventDefault() {} });
    h.timers.fire();
    assert.deepEqual(h.failures, ["YUE_E_CONTEXT_RESTORE_TIMEOUT"]);
    assert.equal(h.controller.snapshot().phase, "failed");
    await h.controller.handleRestored();
    assert.deepEqual(h.failures, ["YUE_E_CONTEXT_RESTORE_TIMEOUT"]);
    assert.equal(h.calls.includes("rebuild"), false);
  });

  test("renderer rejection maps to a safe rebuild failure", async () => {
    const h = harness({ rebuildRenderer: async () => { throw new Error("C:\\Users\\secret <script>"); } });
    h.controller.handleLost({ preventDefault() {} });
    await h.controller.handleRestored();
    assert.deepEqual(h.failures, ["YUE_E_CONTEXT_REBUILD"]);
    assert.equal(h.controller.snapshot().phase, "failed");
    assert.equal(h.timers.count(), 0);
  });

  test("pre-active context loss becomes retryable failure without fake active recovery", () => {
    let captures = 0;
    const h = harness({
      canRecover: () => false,
      capturePose: () => { captures += 1; throw new Error("must not capture"); }
    });
    h.controller.handleLost({ preventDefault() {} });
    assert.equal(captures, 0);
    assert.deepEqual(h.failures, ["YUE_E_CONTEXT_REBUILD"]);
    assert.equal(h.timers.count(), 0);
    assert.equal(h.calls.includes("phase:rebuilding"), false);
  });
  ```

- [ ] **Step 4: Add listener/timer disposal test.**

  Append:

  ```js
  test("dispose clears two listeners, timer and pending recovery", async () => {
    const h = harness();
    assert.equal(h.target.count(), 2);
    h.controller.handleLost({ preventDefault() {} });
    h.controller.dispose();
    h.controller.dispose();
    assert.equal(h.target.count(), 0);
    assert.equal(h.timers.count(), 0);
    await h.controller.handleRestored();
    assert.equal(h.calls.includes("rebuild"), false);
  });
  ```

- [ ] **Step 5: Run recovery checks and record RED.**

  Run: `node scripts/check-yue-e-context-recovery.mjs`

  Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web/yue-e/core/context-recovery.js`.

- [ ] **Step 6: Implement the exact same-runtime/age pose predicate.**

  Start `web/yue-e/core/context-recovery.js` with:

  ```js
  import { createYueEError } from "./errors.js?v=20260821-yue-e-phase1-1";

  export function isUsableRecoveryPose(pose, { runtimeId, now, maxPoseAgeMs }) {
    return pose !== null
      && typeof pose === "object"
      && pose.runtimeId === runtimeId
      && Array.isArray(pose.logicalPosition)
      && pose.logicalPosition.length === 3
      && pose.logicalPosition.every(Number.isFinite)
      && Number.isFinite(pose.logicalRotation)
      && pose.movementMode === "ground"
      && Number.isFinite(pose.capturedAt)
      && pose.capturedAt <= now
      && now - pose.capturedAt <= maxPoseAgeMs;
  }
  ```

- [ ] **Step 7: Implement loss, timer and pre-active failure handling.**

  Append:

  ```js
  export function createContextRecovery(options) {
    let disposed = false;
    let phase = "none";
    let generation = 0;
    let volatilePose = null;
    let timeoutHandle = null;
    let recoveryAbort = null;
    let restorePromise = null;

    const publish = (next) => { phase = next; options.onPhase(next); };
    const clearTimeout = () => {
      if (timeoutHandle !== null) options.timers.clearTimer(timeoutHandle);
      timeoutHandle = null;
    };
    const fail = (code, expectedGeneration) => {
      if (disposed || expectedGeneration !== generation || phase === "failed") return;
      clearTimeout();
      recoveryAbort?.abort();
      recoveryAbort = null;
      restorePromise = null;
      volatilePose = null;
      publish("failed");
      options.onFailure(createYueEError(code));
    };

    const handleLost = (event) => {
      event.preventDefault();
      if (disposed || phase !== "none") return;
      generation += 1;
      const currentGeneration = generation;
      options.stopRendering();
      options.setInputEnabled(false);
      publish("lost");
      if (!options.canRecover()) {
        fail("YUE_E_CONTEXT_REBUILD", currentGeneration);
        return;
      }
      try { volatilePose = Object.freeze(structuredClone(options.capturePose())); }
      catch { fail("YUE_E_CONTEXT_REBUILD", currentGeneration); return; }
      timeoutHandle = options.timers.setTimer(
        () => fail("YUE_E_CONTEXT_RESTORE_TIMEOUT", currentGeneration),
        options.timeoutMs
      );
    };
  ```

- [ ] **Step 8: Implement restored generation fencing and three-frame recovery.**

  Append inside `createContextRecovery`:

  ```js
    const handleRestored = () => {
      if (disposed || phase === "failed" || phase === "none") return Promise.resolve();
      if (restorePromise) return restorePromise;
      const currentGeneration = generation;
      recoveryAbort = new AbortController();
      restorePromise = (async () => {
        try {
          publish("rebuilding");
          await options.rebuildRenderer();
          if (disposed || currentGeneration !== generation || recoveryAbort.signal.aborted || !options.collisionReady()) {
            throw createYueEError("YUE_E_CONTEXT_REBUILD");
          }
          const stable = await options.renderStableFrames(recoveryAbort.signal);
          if (stable.stableFrames !== 3 || disposed || currentGeneration !== generation) {
            throw createYueEError("YUE_E_CONTEXT_REBUILD");
          }
          if (isUsableRecoveryPose(volatilePose, {
            runtimeId: options.runtimeId,
            now: options.timers.now(),
            maxPoseAgeMs: options.maxPoseAgeMs
          })) options.applyPose(volatilePose);
          else options.respawn();
          publish("fading-in");
          await options.fadeIn(recoveryAbort.signal);
          if (disposed || currentGeneration !== generation || recoveryAbort.signal.aborted) return;
          clearTimeout();
          recoveryAbort = null;
          restorePromise = null;
          volatilePose = null;
          options.setInputEnabled(true);
          options.resumeRendering();
          publish("none");
        } catch {
          fail("YUE_E_CONTEXT_REBUILD", currentGeneration);
        }
      })();
      return restorePromise;
    };
  ```

- [ ] **Step 9: Bind exactly two events and complete diagnostics/disposal.**

  Complete the function:

  ```js
    const onLost = (event) => handleLost(event);
    const onRestored = () => { void handleRestored(); };
    options.target.addEventListener("webglcontextlost", onLost);
    options.target.addEventListener("webglcontextrestored", onRestored);

    return Object.freeze({
      handleLost,
      handleRestored,
      snapshot: () => Object.freeze({ phase, generation, hasVolatilePose: volatilePose !== null }),
      dispose() {
        if (disposed) return;
        disposed = true;
        generation += 1;
        clearTimeout();
        recoveryAbort?.abort();
        recoveryAbort = null;
        restorePromise = null;
        volatilePose = null;
        options.target.removeEventListener("webglcontextlost", onLost);
        options.target.removeEventListener("webglcontextrestored", onRestored);
      }
    });
  }
  ```

- [ ] **Step 10: Run context recovery tests to GREEN and syntax-check.**

  Run:

  ```powershell
  node scripts/check-yue-e-context-recovery.mjs
  node --check web/yue-e/core/context-recovery.js
  ```

  Expected: seven TAP subtests pass; timeout emits once; expired/foreign pose respawns; dispose reports zero fake listeners and timers.

- [ ] **Step 11: Commit context recovery.**

  ```powershell
  git add web/yue-e/core/context-recovery.js scripts/check-yue-e-context-recovery.mjs
  git diff --cached --check
  git commit -m "feat: recover Yue E WebGL context"
  ```

---

### Task 9: Compose the six-method runtime and prove the one-heavy-RAF invariant

**Files:**

- Create: `web/yue-e/runtime.js`
- Create: `scripts/check-yue-e-runtime-shell.mjs`

**Interfaces:**

- `createYueERuntime(platform) -> FeYueE` uses production factories.
- `createYueERuntimeWithFactories(platform, factories) -> FeYueE` is the deterministic test seam; both return an object whose own keys are exactly the six `FeYueE` methods.
- The runtime waits to acquire `HeavyRafLease` until traveler/collision/anchors are ready, acquires it before shell renderer construction or any YueE RAF, cancels all YueE RAF before `lease.release()`, and releases on every failure/exit/dispose path.

- [ ] **Step 1: Write a shared fake heavy-RAF/timer coordinator.**

  Create `scripts/check-yue-e-runtime-shell.mjs` with:

  ```js
  import assert from "node:assert/strict";
  import test from "node:test";
  import { createYueERuntimeWithFactories } from "../web/yue-e/runtime.js";

  class FakeScheduler {
    #next = 1;
    #frames = new Map();
    #timers = new Map();
    nowMs = 0;
    coordinator = null;
    requestFrame = (callback) => {
      const id = this.#next++;
      this.#frames.set(id, callback);
      this.coordinator.yuePending = this.#frames.size;
      this.coordinator.sampleMaximum();
      return id;
    };
    cancelFrame = (id) => {
      this.#frames.delete(id);
      this.coordinator.yuePending = this.#frames.size;
      this.coordinator.sampleMaximum();
    };
    setTimer = (callback) => { const id = this.#next++; this.#timers.set(id, callback); return id; };
    clearTimer = (id) => { this.#timers.delete(id); };
    now = () => this.nowMs;
    fireFrame() {
      const [[id, callback]] = this.#frames;
      assert.notEqual(callback, undefined, "expected one pending Yue E frame");
      this.#frames.delete(id);
      this.coordinator.yuePending = this.#frames.size;
      this.nowMs += 16;
      callback(this.nowMs);
    }
    pendingFrames() { return this.#frames.size; }
    pendingTimers() { return this.#timers.size; }
  }

  class FakeCoordinator {
    constructor() {
      this.basePending = 1;
      this.yuePending = 0;
      this.maxCombinedPending = 1;
      this.acquireCalls = 0;
      this.releaseCalls = 0;
    }
    sampleMaximum() {
      this.maxCombinedPending = Math.max(this.maxCombinedPending, this.basePending + this.yuePending);
    }
    acquire = async ({ signal }) => {
      this.acquireCalls += 1;
      if (signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      this.basePending = 0;
      this.sampleMaximum();
      let released = false;
      const coordinator = this;
      return {
        owner: "yue-e",
        get released() { return released; },
        release() {
          if (released) return;
          released = true;
          coordinator.releaseCalls += 1;
          coordinator.basePending = 1;
          coordinator.sampleMaximum();
        }
      };
    };
    diagnostics = () => ({
      basePending: this.basePending,
      yueEPending: this.yuePending,
      maxCombinedPending: this.maxCombinedPending
    });
  }

  async function waitForPendingFrame(scheduler) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (scheduler.pendingFrames() === 1) return;
      await Promise.resolve();
    }
    assert.fail("runtime did not schedule its next frame");
  }
  ```

- [ ] **Step 2: Add exact domain/platform and disposable fake factories.**

  Append:

  ```js
  const travelerReport = Object.freeze({
    heightMeters: 1.35,
    triangleCount: 42000,
    boneCount: 39,
    wingPanelCount: 12,
    bodyBounds: { min: [-0.3, 0, -0.2], max: [0.3, 1.35, 0.2] },
    bodyMaxRadialDistance: 0.29,
    lod0SemanticIds: ["yue-e.lod0.body"],
    bindPoseMaxResidual: 0.0001,
    exportedPoseProbes: [],
    rigFingerprintSha256: "D".repeat(64),
    approvedLod0FingerprintSha256: "E".repeat(64)
  });

  function domain(spies) {
    return {
      playerCommands: {
        snapshot: () => ({ songId: "song-1", queueRevision: 7, paused: false, currentTime: 19 }),
        subscribe: () => () => {},
        play: async () => { spies.mediaMutations += 1; },
        pause: () => { spies.mediaMutations += 1; },
        next: () => { spies.mediaMutations += 1; },
        previous: () => { spies.mediaMutations += 1; },
        seek: () => { spies.mediaMutations += 1; }
      },
      playlistNodeProvider: { get: () => null },
      achievementEvents: { emit: () => {} },
      spatialAudioBackend: { snapshot: () => ({ kind: "none", ready: false }) },
      resolveResource: (id) => {
        if (id !== "yue-e.traveler.lookdev.manifest") throw Object.assign(new Error("unknown"), { code: "YUE_E_RESOURCE_UNKNOWN" });
        return "https://app.test/assets/yue-e/character/yue-e-traveler-lookdev.manifest.json";
      },
      logger: { debug() {}, info() {}, warn() {}, error() {} }
    };
  }

  function makeHarness(overrides = {}) {
    const scheduler = new FakeScheduler();
    const coordinator = new FakeCoordinator();
    scheduler.coordinator = coordinator;
    const events = [];
    const disposals = [];
    const recoveryRecords = [];
    const spies = { mediaMutations: 0 };
    let rendererGeneration = 1;
    const shell = {
      rendered: 0,
      inputEnabled: false,
      renderFrame() { this.rendered += 1; },
      readiness() {
        const ready = this.rendered > 0;
        return { terrain: true, collision: true, character: true, anchors: true, renderer: true, frame: ready, firstFrameSafe: ready };
      },
      setInputEnabled(value) { this.inputEnabled = value; events.push(`input:${value}`); },
      rebuildRenderer: async () => { rendererGeneration += 1; return { rendererGeneration }; },
      diagnostics: () => ({
        rendererGeneration,
        rendererCount: rendererGeneration,
        loseContextCalls: 0,
        frameCount: shell.rendered,
        inputEnabled: shell.inputEnabled,
        observerActive: true,
        resources: { geometries: 5, materials: 3, textures: 0, renderTargets: 0 },
        rendererLedgers: []
      }),
      dispose(input) { disposals.push(["shell", input ?? {}]); }
    };
    const traveler = {
      scene: { position: { toArray: () => [0, 0, 0], fromArray() {} }, rotation: { y: 0 } },
      report: travelerReport,
      assetSha256: "A".repeat(64),
      dispose() { disposals.push(["traveler"]); }
    };
    const anchors = {
      ids: ["respawn", "presetGallery", "playlist", "functionDock", "overlay"],
      get: () => ({ position: { toArray: () => [0, 0, 0] } }),
      readiness: () => ({ anchors: true }),
      dispose() { disposals.push(["anchors"]); }
    };
    const platform = {
      documentUrl: "https://app.test/index.html",
      three: {},
      ensureGltfLoader: async () => class {},
      createRenderer: () => ({}),
      elements: {
        root: {}, canvas: {}, status: { textContent: "", hidden: true },
        recovery: { hidden: true, dataset: {} }, retryButton: {}, exitButton: {}
      },
      fetch: async () => { throw new Error("fake loader bypasses fetch"); },
      cryptoSubtle: {},
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame,
      devicePixelRatio: () => 1,
      resizeObserverFactory: () => ({ observe() {}, disconnect() {} }),
      timers: scheduler,
      heavyRafCoordinator: coordinator,
      prefersReducedMotion: () => false,
      waitForSurfaceTransition: async ({ direction }) => { events.push(`transition:${direction}`); },
      setBaseSurfaceObscured: (value) => events.push(`base-obscured:${value}`),
      onPhase: (detail) => events.push(`phase:${detail.phase}/${detail.recoveryPhase}`),
      ...overrides.platform
    };
    const factories = {
      loadApprovedTraveler: async () => { events.push(`load:base=${coordinator.basePending}`); return traveler; },
      createPhase1Collision: () => ({
        ready: true, kind: "capsule", radius: 0.31,
        segmentStart: [0, 0.31, 0], segmentEnd: [0, 1.04, 0],
        bodyCenterXZ: [0, 0], visualOverhangMeters: 0, source: "approved-body-metrics"
      }),
      createMusicZoneAnchors: () => anchors,
      createShellScene: () => { events.push(`shell:base=${coordinator.basePending}`); return shell; },
      createContextRecovery: (options) => {
        recoveryRecords.push(options);
        return { snapshot: () => ({ phase: "none", generation: 0, hasVolatilePose: false }), dispose() { disposals.push(["recovery"]); } };
      },
      ...overrides.factories
    };
    return { scheduler, coordinator, events, disposals, recoveryRecords, spies, shell, platform, factories };
  }

  async function enterActive(runtime, scheduler) {
    const entering = runtime.enter();
    await waitForPendingFrame(scheduler);
    for (let frame = 0; frame < 3; frame += 1) {
      scheduler.fireFrame();
      await Promise.resolve();
    }
    return { entering, result: await entering };
  }
  ```

- [ ] **Step 3: Add exact surface, poisoned-global and one-heavy-RAF tests.**

  Append:

  ```js
  test("runtime exposes exactly six methods and mount reads only injected domain", async () => {
    const h = makeHarness();
    const runtime = createYueERuntimeWithFactories(h.platform, h.factories);
    assert.deepEqual(Object.keys(runtime).sort(), ["dispose", "enter", "exit", "mount", "restore", "snapshot"]);
    const previousWindow = globalThis.window;
    globalThis.window = new Proxy({}, { get(_target, key) { throw new Error(`forbidden window.${String(key)}`); } });
    try { runtime.mount(domain(h.spies)); }
    finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
    const { entering, result } = await enterActive(runtime, h.scheduler);
    assert.strictEqual(runtime.enter(), entering);
    assert.deepEqual(result.ready, true);
    assert.equal(result.stableFrames, 3);
    assert.equal(h.events.includes("load:base=1"), true);
    assert.equal(h.events.includes("shell:base=0"), true);
    assert.equal(h.coordinator.maxCombinedPending, 1);
    assert.equal(h.spies.mediaMutations, 0);
    assert.equal(h.recoveryRecords[0].canRecover(), true);
  });

  test("base keeps rendering through load and lease precedes the first Yue E frame", async () => {
    let releaseLoad;
    const loadBarrier = new Promise((resolve) => { releaseLoad = resolve; });
    const h = makeHarness({
      factories: {
        loadApprovedTraveler: async () => {
          h.events.push(`load-start:base=${h.coordinator.basePending}`);
          await loadBarrier;
          return {
            scene: { position: { toArray: () => [0, 0, 0], fromArray() {} }, rotation: { y: 0 } },
            report: travelerReport,
            assetSha256: "A".repeat(64),
            dispose() { h.disposals.push(["traveler"]); }
          };
        }
      }
    });
    const runtime = createYueERuntimeWithFactories(h.platform, h.factories);
    runtime.mount(domain(h.spies));
    const entering = runtime.enter();
    await Promise.resolve();
    assert.equal(h.coordinator.basePending, 1);
    assert.equal(h.coordinator.acquireCalls, 0);
    assert.equal(h.scheduler.pendingFrames(), 0);
    releaseLoad();
    await waitForPendingFrame(h.scheduler);
    assert.equal(h.coordinator.basePending, 0);
    assert.equal(h.coordinator.acquireCalls, 1);
    for (let frame = 0; frame < 3; frame += 1) { h.scheduler.fireFrame(); await Promise.resolve(); }
    await entering;
    assert.equal(h.coordinator.maxCombinedPending, 1);
  });
  ```

- [ ] **Step 4: Add retry, safe-error and domain-preservation tests.**

  Append:

  ```js
  test("core load failure is retryable on the same runtime and leaves media untouched", async () => {
    let loads = 0;
    const h = makeHarness({
      factories: {
        loadApprovedTraveler: async () => {
          loads += 1;
          if (loads === 1) throw new Error("C:\\Users\\secret powershell -Command <script>");
          return {
            scene: { position: { toArray: () => [0, 0, 0], fromArray() {} }, rotation: { y: 0 } },
            report: travelerReport,
            assetSha256: "A".repeat(64),
            dispose() { h.disposals.push(["traveler"]); }
          };
        }
      }
    });
    const runtime = createYueERuntimeWithFactories(h.platform, h.factories);
    runtime.mount(domain(h.spies));
    await assert.rejects(runtime.enter(), (error) => error.code === "YUE_E_ASSET_PARSE");
    assert.equal(h.coordinator.basePending, 1);
    assert.equal(h.platform.elements.status.textContent.includes("C:\\Users"), false);
    const { result } = await enterActive(runtime, h.scheduler);
    assert.equal(result.ready, true);
    assert.equal(loads, 2);
    assert.equal(h.spies.mediaMutations, 0);
  });
  ```

- [ ] **Step 5: Add concurrent exit, transition and reduced-motion tests.**

  Append:

  ```js
  test("concurrent ordinary exit cancels Yue E RAF before one release", async () => {
    let resolveExit;
    const exitBarrier = new Promise((resolve) => { resolveExit = resolve; });
    const h = makeHarness({
      platform: {
        waitForSurfaceTransition: ({ direction }) => direction === "exit" ? exitBarrier : Promise.resolve()
      }
    });
    const runtime = createYueERuntimeWithFactories(h.platform, h.factories);
    runtime.mount(domain(h.spies));
    await enterActive(runtime, h.scheduler);
    assert.equal(h.scheduler.pendingFrames(), 1);
    const first = runtime.exit("button");
    const second = runtime.exit("escape");
    assert.strictEqual(first, second);
    assert.equal(h.scheduler.pendingFrames(), 0);
    assert.equal(h.coordinator.basePending, 0);
    resolveExit();
    assert.deepEqual(await first, { exited: true, reason: "button" });
    assert.equal(h.coordinator.releaseCalls, 1);
    assert.equal(h.coordinator.basePending, 1);
    assert.equal(h.coordinator.maxCombinedPending, 1);
    assert.deepEqual(h.disposals.slice(-3).map(([name]) => name), ["recovery", "shell", "traveler"]);
  });

  test("reduced motion and suspension exits do not wait for a transition", async () => {
    for (const reason of ["visibility-hidden", "pagehide-persisted"]) {
      let waits = 0;
      const h = makeHarness({ platform: { waitForSurfaceTransition: async () => { waits += 1; } } });
      const runtime = createYueERuntimeWithFactories(h.platform, h.factories);
      runtime.mount(domain(h.spies));
      await enterActive(runtime, h.scheduler);
      const waitsAfterEnter = waits;
      await runtime.exit(reason);
      assert.equal(waits, waitsAfterEnter);
      assert.equal(h.coordinator.basePending, 1);
      assert.equal(runtime.snapshot().diagnostics.phase, "mounted");
    }
    let waits = 0;
    const h = makeHarness({
      platform: {
        prefersReducedMotion: () => true,
        waitForSurfaceTransition: async () => { waits += 1; }
      }
    });
    const runtime = createYueERuntimeWithFactories(h.platform, h.factories);
    runtime.mount(domain(h.spies));
    await enterActive(runtime, h.scheduler);
    await runtime.exit("button");
    assert.equal(waits, 0);
  });
  ```

- [ ] **Step 6: Add snapshot, restore, context-failure and final-dispose tests.**

  Append:

  ```js
  test("snapshot/restore is Yue E-only, idempotent and never restores media", () => {
    const h = makeHarness();
    const runtime = createYueERuntimeWithFactories(h.platform, h.factories);
    runtime.mount(domain(h.spies));
    const snapshot = runtime.snapshot();
    assert.equal(snapshot.version, 2);
    assert.equal(JSON.stringify(snapshot).match(/song|queue|currentTime|media/iu), null);
    assert.deepEqual(runtime.restore(snapshot), runtime.restore(snapshot));
    assert.deepEqual(runtime.restore({ version: 99 }), {
      ok: false, reset: true, spawn: "respawn", errorCode: "YUE_E_SNAPSHOT_INVALID"
    });
    assert.equal(h.spies.mediaMutations, 0);
  });

  test("context failure disposes a lost renderer without force-loss and releases lease", async () => {
    const h = makeHarness();
    const runtime = createYueERuntimeWithFactories(h.platform, h.factories);
    runtime.mount(domain(h.spies));
    await enterActive(runtime, h.scheduler);
    h.recoveryRecords[0].onPhase("failed");
    h.recoveryRecords[0].onFailure({ code: "YUE_E_CONTEXT_RESTORE_TIMEOUT" });
    const shellDisposal = h.disposals.find(([name]) => name === "shell");
    assert.deepEqual(shellDisposal, ["shell", { previousContextLost: true }]);
    assert.equal(h.coordinator.basePending, 1);
    assert.equal(runtime.snapshot().diagnostics.phase, "error");
  });

  test("dispose is final and leaves no owned frame/timer/lease", async () => {
    const h = makeHarness();
    const runtime = createYueERuntimeWithFactories(h.platform, h.factories);
    runtime.mount(domain(h.spies));
    await enterActive(runtime, h.scheduler);
    runtime.dispose();
    runtime.dispose();
    assert.equal(h.scheduler.pendingFrames(), 0);
    assert.equal(h.scheduler.pendingTimers(), 0);
    assert.equal(h.coordinator.basePending, 1);
    assert.equal(runtime.snapshot().diagnostics.phase, "disposed");
    await assert.rejects(runtime.enter(), (error) => error.code === "YUE_E_INVALID_TRANSITION");
  });
  ```

- [ ] **Step 7: Run the composition checker and record runtime RED.**

  Run: `node scripts/check-yue-e-runtime-shell.mjs`

  Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web/yue-e/runtime.js`.

- [ ] **Step 8: Implement versioned imports, factories and domain validation.**

  Start `web/yue-e/runtime.js` with:

  ```js
  import { loadApprovedTraveler } from "./character/lookdev-loader.js?v=20260821-yue-e-phase1-1";
  import { createContextRecovery } from "./core/context-recovery.js?v=20260821-yue-e-phase1-1";
  import { createYueEError, toSafeYueEError } from "./core/errors.js?v=20260821-yue-e-phase1-1";
  import { createYueELifecycle } from "./core/lifecycle.js?v=20260821-yue-e-phase1-1";
  import {
    buildYueESnapshot,
    createDefaultYueEDurable,
    restoreYueESnapshot
  } from "./core/snapshot.js?v=20260821-yue-e-phase1-1";
  import { waitForStableFrames } from "./core/stable-frames.js?v=20260821-yue-e-phase1-1";
  import { YUE_E_RESOURCE_IDS } from "./character/lookdev-contract.js?v=20260821-yue-e-phase1-1";
  import { createMusicZoneAnchors } from "./music-zone/anchors.js?v=20260821-yue-e-phase1-1";
  import { createShellScene } from "./scene/shell-scene.js?v=20260821-yue-e-phase1-1";
  import { createPhase1Collision } from "./world/phase-1-collision.js?v=20260821-yue-e-phase1-1";

  const DEFAULT_FACTORIES = Object.freeze({
    loadApprovedTraveler,
    createContextRecovery,
    createMusicZoneAnchors,
    createShellScene,
    createPhase1Collision,
    waitForStableFrames
  });
  const DOMAIN_KEYS = Object.freeze([
    "achievementEvents", "logger", "playerCommands", "playlistNodeProvider",
    "resolveResource", "spatialAudioBackend"
  ]);
  const EXIT_REASONS = new Set([
    "button", "escape", "navigation", "mode-switch", "visibility-hidden",
    "pagehide-persisted", "runtime-error"
  ]);
  const IMMEDIATE_EXIT_REASONS = new Set(["visibility-hidden", "pagehide-persisted", "runtime-error"]);
  let runtimeOrdinal = 0;

  function validFunctions(value, names) {
    return value && names.every((name) => typeof value[name] === "function");
  }

  function assertDomainDependencies(value) {
    if (!value || Object.keys(value).sort().join("|") !== DOMAIN_KEYS.join("|")
      || !validFunctions(value.playerCommands, ["snapshot", "subscribe", "play", "pause", "next", "previous", "seek"])
      || !validFunctions(value.playlistNodeProvider, ["get"])
      || !validFunctions(value.achievementEvents, ["emit"])
      || !validFunctions(value.spatialAudioBackend, ["snapshot"])
      || typeof value.resolveResource !== "function"
      || !validFunctions(value.logger, ["debug", "info", "warn", "error"])) {
      throw createYueEError("YUE_E_INVALID_TRANSITION");
    }
  }

  export function createYueERuntime(platform) {
    return createYueERuntimeWithFactories(platform, DEFAULT_FACTORIES);
  }
  ```

- [ ] **Step 9: Initialize all runtime-owned state and diagnostics.**

  Append:

  ```js
  export function createYueERuntimeWithFactories(platform, factoryOverrides = {}) {
    const factories = Object.freeze({ ...DEFAULT_FACTORIES, ...factoryOverrides });
    const runtimeId = `yue-e-runtime-${++runtimeOrdinal}`;
    let dependencies = null;
    let recoveryPhase = "none";
    let durable = createDefaultYueEDurable();
    let volatileRecovery = null;
    let operationAbort = null;
    let enterPromise = null;
    let exitPromise = null;
    let activeResult = null;
    let activeRaf = null;
    let lastFrameTime = null;
    let stableFrames = 0;
    let traveler = null;
    let collision = null;
    let anchors = null;
    let shell = null;
    let recovery = null;
    let lease = null;
    let contextRendererLost = false;

    const emitPhase = () => {
      const state = lifecycle.state();
      platform.onPhase({ phase: state.phase, recoveryPhase, errorCode: state.errorCode });
    };
    const lifecycle = createYueELifecycle(emitPhase);
    const safeDispose = (label, callback) => {
      try { callback?.(); }
      catch (error) { dependencies?.logger.warn(`Yue E ${label} disposal failed`, error?.name ?? "Error"); }
    };
    const shellDiagnostics = () => shell?.diagnostics() ?? {
      rendererGeneration: 0,
      rendererCount: 0,
      loseContextCalls: 0,
      frameCount: 0,
      inputEnabled: false,
      observerActive: false,
      resources: { geometries: 0, materials: 0, textures: 0, renderTargets: 0 },
      rendererLedgers: []
    };
    const diagnostics = () => {
      const state = lifecycle.state();
      const scene = shellDiagnostics();
      return Object.freeze({
        phase: state.phase,
        recoveryPhase,
        operationToken: state.token,
        stableFrames,
        rafRunning: activeRaf !== null,
        listenerCount: recovery ? 2 : 0,
        resources: scene.resources,
        rendererCount: scene.rendererCount,
        loseContextCalls: scene.loseContextCalls,
        heavyRaf: platform.heavyRafCoordinator.diagnostics(),
        assetSha256: traveler?.assetSha256 ?? null,
        errorCode: state.errorCode
      });
    };
  ```

- [ ] **Step 10: Implement active RAF ownership and ordered session cleanup.**

  Append inside `createYueERuntimeWithFactories`:

  ```js
    const stopActiveRaf = () => {
      if (activeRaf !== null) platform.cancelFrame(activeRaf);
      activeRaf = null;
      lastFrameTime = null;
    };
    const startActiveRaf = () => {
      if (activeRaf !== null || !shell) return;
      const tick = (timeMs) => {
        activeRaf = null;
        if (lifecycle.state().phase !== "active" || recoveryPhase !== "none" || !shell) return;
        const dtSeconds = lastFrameTime === null ? 0 : Math.min(0.05, Math.max(0, (timeMs - lastFrameTime) / 1000));
        lastFrameTime = timeMs;
        shell.renderFrame(timeMs, dtSeconds);
        activeRaf = platform.requestFrame(tick);
      };
      activeRaf = platform.requestFrame(tick);
    };
    const disposeSession = ({ previousContextLost = false } = {}) => {
      stopActiveRaf();
      const ownedRecovery = recovery;
      const ownedShell = shell;
      const ownedTraveler = traveler;
      const ownedAnchors = anchors;
      const ownedLease = lease;
      recovery = null;
      shell = null;
      traveler = null;
      anchors = null;
      collision = null;
      lease = null;
      activeResult = null;
      volatileRecovery = null;
      recoveryPhase = "none";
      stableFrames = 0;
      contextRendererLost = false;
      safeDispose("recovery", () => ownedRecovery?.dispose());
      safeDispose("shell", () => ownedShell?.dispose({ previousContextLost }));
      safeDispose("traveler", () => ownedTraveler?.dispose());
      safeDispose("anchors", () => ownedAnchors?.dispose());
      safeDispose("heavy RAF lease", () => ownedLease?.release());
    };
  ```

- [ ] **Step 11: Implement recovery wiring against the same shell and lease.**

  Append:

  ```js
    const setRecoveryPhase = (next) => {
      recoveryPhase = next;
      platform.elements.recovery.hidden = next === "none";
      platform.elements.recovery.dataset.phase = next;
      if (next === "lost") contextRendererLost = true;
      if (next === "none") volatileRecovery = null;
      emitPhase();
    };
    const applyLogicalPose = (pose) => {
      traveler.scene.position.fromArray(pose.logicalPosition);
      traveler.scene.rotation.y = pose.logicalRotation;
    };
    const useRespawn = () => {
      traveler.scene.position.fromArray(anchors.get("respawn").position.toArray());
      traveler.scene.rotation.y = 0;
    };
    const failFromContext = (error) => {
      const token = lifecycle.state().token;
      const code = error.code === "YUE_E_CONTEXT_RESTORE_TIMEOUT"
        ? "YUE_E_CONTEXT_RESTORE_TIMEOUT"
        : "YUE_E_CONTEXT_REBUILD";
      disposeSession({ previousContextLost: contextRendererLost });
      platform.setBaseSurfaceObscured(false);
      lifecycle.markError(token, code);
      platform.elements.status.textContent = createYueEError(code).message;
      platform.elements.status.hidden = false;
    };
    const createRecoveryController = () => factories.createContextRecovery({
      target: platform.elements.canvas,
      timers: platform.timers,
      runtimeId,
      timeoutMs: 8000,
      maxPoseAgeMs: 10000,
      canRecover: () => lifecycle.state().phase === "active" && lease !== null,
      stopRendering: () => {
        stopActiveRaf();
        if (lifecycle.state().phase !== "active") operationAbort?.abort();
      },
      setInputEnabled: (enabled) => shell?.setInputEnabled(enabled),
      capturePose: () => {
        volatileRecovery = Object.freeze({
          runtimeId,
          logicalPosition: Object.freeze(traveler.scene.position.toArray()),
          logicalRotation: traveler.scene.rotation.y,
          movementMode: "ground",
          capturedAt: platform.timers.now()
        });
        return volatileRecovery;
      },
      applyPose: applyLogicalPose,
      respawn: useRespawn,
      collisionReady: () => collision?.ready === true,
      rebuildRenderer: async () => {
        await shell.rebuildRenderer({ previousContextLost: true });
        contextRendererLost = false;
      },
      renderStableFrames: (signal) => {
        let previous = null;
        return factories.waitForStableFrames({
          count: 3,
          requestFrame: platform.requestFrame,
          cancelFrame: platform.cancelFrame,
          sampleFrame: (timeMs) => {
            const dt = previous === null ? 0 : Math.min(0.05, (timeMs - previous) / 1000);
            previous = timeMs;
            shell.renderFrame(timeMs, dt);
            return shell.readiness().firstFrameSafe;
          },
          signal,
          timeoutMs: 8000,
          timers: platform.timers
        });
      },
      fadeIn: (signal) => platform.prefersReducedMotion()
        ? Promise.resolve()
        : platform.waitForSurfaceTransition({ direction: "enter", signal }),
      resumeRendering: startActiveRaf,
      onPhase: setRecoveryPhase,
      onFailure: failFromContext
    });
  ```

- [ ] **Step 12: Implement load-through-stable-frame enter orchestration.**

  Append:

  ```js
    const enter = (options = {}) => {
      if (lifecycle.state().phase === "active") return Promise.resolve(activeResult);
      if (enterPromise) return enterPromise;
      let descriptor;
      try { descriptor = lifecycle.beginEnter(); }
      catch (error) { return Promise.reject(error); }
      const controller = new AbortController();
      operationAbort = controller;
      const externalSignal = options.signal;
      const abortFromExternal = () => controller.abort();
      if (externalSignal?.aborted) controller.abort();
      else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
      let currentFrameTime = null;
      let promise;
      promise = (async () => {
        try {
          platform.elements.status.textContent = "正在准备遇E音乐区…";
          platform.elements.status.hidden = false;
          let manifestUrl;
          try { manifestUrl = dependencies.resolveResource(YUE_E_RESOURCE_IDS.travelerManifest); }
          catch { throw createYueEError("YUE_E_RESOURCE_UNKNOWN"); }
          if (typeof manifestUrl !== "string") throw createYueEError("YUE_E_RESOURCE_UNKNOWN");
          const loaded = await factories.loadApprovedTraveler({
            manifestUrl,
            documentUrl: platform.documentUrl,
            fetch: platform.fetch,
            cryptoSubtle: platform.cryptoSubtle,
            ensureGltfLoader: platform.ensureGltfLoader,
            three: platform.three,
            signal: controller.signal,
            isOperationCurrent: () => lifecycle.isCurrent(descriptor.token)
          });
          if (!lifecycle.isCurrent(descriptor.token) || controller.signal.aborted) {
            loaded.dispose();
            throw createYueEError("YUE_E_ENTER_ABORTED");
          }
          traveler = loaded;
          collision = factories.createPhase1Collision(traveler.report);
          anchors = factories.createMusicZoneAnchors(platform.three);
          const acquired = await platform.heavyRafCoordinator.acquire({ owner: "yue-e", signal: controller.signal });
          if (!lifecycle.isCurrent(descriptor.token) || controller.signal.aborted) {
            acquired.release();
            throw createYueEError("YUE_E_ENTER_ABORTED");
          }
          lease = acquired;
          shell = factories.createShellScene({
            three: platform.three,
            canvas: platform.elements.canvas,
            createRenderer: platform.createRenderer,
            devicePixelRatio: platform.devicePixelRatio,
            resizeObserverFactory: platform.resizeObserverFactory,
            traveler,
            collision,
            anchors
          });
          recovery = createRecoveryController();
          lifecycle.markReady(descriptor.token);
          const stable = await factories.waitForStableFrames({
            count: 3,
            requestFrame: platform.requestFrame,
            cancelFrame: platform.cancelFrame,
            sampleFrame: (timeMs) => {
              const dt = currentFrameTime === null ? 0 : Math.min(0.05, (timeMs - currentFrameTime) / 1000);
              currentFrameTime = timeMs;
              shell.renderFrame(timeMs, dt);
              const healthy = shell.readiness().firstFrameSafe;
              stableFrames = healthy ? Math.min(3, stableFrames + 1) : 0;
              return healthy;
            },
            signal: controller.signal,
            timeoutMs: 8000,
            timers: platform.timers
          });
          if (!lifecycle.isCurrent(descriptor.token) || stable.stableFrames !== 3) {
            throw createYueEError("YUE_E_ENTER_ABORTED");
          }
          const gateReport = Object.freeze({
            assetSha256: traveler.assetSha256,
            readiness: shell.readiness(),
            collision,
            anchorIds: Object.freeze([...anchors.ids])
          });
          lifecycle.markEntering(descriptor.token);
          platform.setBaseSurfaceObscured(true);
          if (!platform.prefersReducedMotion()) {
            await platform.waitForSurfaceTransition({ direction: "enter", signal: controller.signal });
          }
          if (!lifecycle.isCurrent(descriptor.token) || controller.signal.aborted) {
            throw createYueEError("YUE_E_ENTER_ABORTED");
          }
          shell.setInputEnabled(true);
          lifecycle.markActive(descriptor.token);
          platform.elements.status.hidden = true;
          activeResult = Object.freeze({ ready: true, stableFrames: 3, gateReport });
          startActiveRaf();
          return activeResult;
        } catch (error) {
          const safe = toSafeYueEError(error, "YUE_E_ASSET_PARSE");
          if (lifecycle.isCurrent(descriptor.token)) {
            disposeSession();
            platform.setBaseSurfaceObscured(false);
            lifecycle.markError(descriptor.token, safe.code);
            platform.elements.status.textContent = safe.message;
            platform.elements.status.hidden = false;
          }
          throw safe;
        } finally {
          externalSignal?.removeEventListener("abort", abortFromExternal);
          if (operationAbort === controller) operationAbort = null;
          if (enterPromise === promise) enterPromise = null;
        }
      })();
      enterPromise = promise;
      return promise;
    };
  ```

- [ ] **Step 13: Implement single-flight exit and immediate suspension paths.**

  Append:

  ```js
    const exit = (reason) => {
      if (exitPromise) return exitPromise;
      if (!EXIT_REASONS.has(reason)) return Promise.reject(createYueEError("YUE_E_INVALID_TRANSITION"));
      let descriptor;
      try { descriptor = lifecycle.beginExit(reason); }
      catch (error) { return Promise.reject(error); }
      operationAbort?.abort();
      stopActiveRaf();
      shell?.setInputEnabled(false);
      const shouldWait = shell !== null
        && !IMMEDIATE_EXIT_REASONS.has(reason)
        && !platform.prefersReducedMotion();
      let promise;
      promise = (async () => {
        try {
          if (shouldWait) {
            await platform.waitForSurfaceTransition({
              direction: "exit",
              signal: new AbortController().signal
            });
          }
        } finally {
          disposeSession({ previousContextLost: contextRendererLost });
          platform.setBaseSurfaceObscured(false);
          lifecycle.finishExit(descriptor.token);
        }
        return Object.freeze({ exited: true, reason: descriptor.reason });
      })().finally(() => {
        if (exitPromise === promise) exitPromise = null;
      });
      exitPromise = promise;
      return promise;
    };
  ```

- [ ] **Step 14: Implement snapshot/restore, final disposal and exact six-method return.**

  Complete `createYueERuntimeWithFactories`:

  ```js
    const snapshot = () => buildYueESnapshot({
      durable,
      volatileRecovery,
      diagnostics: diagnostics()
    });
    const restore = (value) => {
      const result = restoreYueESnapshot(value);
      durable = result.ok ? result.value : createDefaultYueEDurable();
      volatileRecovery = null;
      return result;
    };
    const dispose = () => {
      if (lifecycle.state().phase === "disposed") return;
      operationAbort?.abort();
      stopActiveRaf();
      const previousContextLost = contextRendererLost;
      lifecycle.dispose();
      disposeSession({ previousContextLost });
      platform.setBaseSurfaceObscured(false);
    };
    const mount = (domainDependencies) => {
      assertDomainDependencies(domainDependencies);
      lifecycle.mount();
      dependencies = domainDependencies;
      platform.elements.status.hidden = true;
      platform.elements.recovery.hidden = true;
    };

    return Object.freeze({ mount, enter, exit, snapshot, restore, dispose });
  }
  ```

- [ ] **Step 15: Run runtime composition tests to GREEN.**

  Run:

  ```powershell
  node scripts/check-yue-e-runtime-shell.mjs
  node --check web/yue-e/runtime.js
  ```

  Expected: eight TAP subtests pass; every harness reports `maxCombinedPending:1`, base stays at 1 throughout blocked loading, and every exit/failure/dispose ends with base 1 and YueE 0.

- [ ] **Step 16: Commit the six-method runtime.**

  ```powershell
  git add web/yue-e/runtime.js scripts/check-yue-e-runtime-shell.mjs
  git diff --cached --check
  git commit -m "feat: compose Yue E runtime shell"
  ```
