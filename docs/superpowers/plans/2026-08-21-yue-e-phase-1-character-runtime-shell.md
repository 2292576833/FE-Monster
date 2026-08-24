# 遇E 第 1 阶段：角色外观/骨骼闸门与运行时壳 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可由用户旋转验收的原创真实三维“遇E旅人”外观/骨骼基准；只有该模型获批后，才在现有应用中加入“场景”入口、可安全进入/退出的遇E空音乐区运行时壳、连续三帧显现门和不干扰播放器的失败回退。

**Architecture:** 第 1A 段以 Blender 5.1.2 脚本生成可复现的米制角色源、真实 Armature/SkinnedMesh 和未压缩自包含 GLB，原始 GLB 解析器与项目实际 Three.js r128 浏览器转台共同把关，并以模型 SHA-256 记录人工批准。第 1B 段把遇E实现为独立、依赖注入、可幂等释放的 ESM 运行时；主应用只保留薄桥接层，先预载并稳定渲染三帧，再交叉淡入并隐藏原界面，任何失败都保持原播放器与原页面不变。

**Tech Stack:** Blender 5.1.2 (`bpy`/glTF 2.0 exporter)、Node.js 24 `.mjs` 检查器、Three.js npm 0.185.1（无 WebGL 的结构测试）、浏览器运行时 Three.js/GLTFLoader r128、Edge headless + 原始 CDP、现有 HTML/CSS/JavaScript 应用。

**Spec:** `docs/superpowers/specs/2026-08-21-yue-e-open-world-scene-design.md`

**Executable decomposition:** This document is the Phase 1 contract/acceptance roadmap. Execute its requirements only through the bite-sized sub-plans below, in order; their tests and code steps are authoritative while this roadmap owns cross-plan invariants and the two user gates.

1. `docs/superpowers/plans/2026-08-22-yue-e-phase-1a-character-gate.md` — original traveler source, GLB validation, r128 turntable and USER GATE A.
2. `docs/superpowers/plans/2026-08-22-yue-e-phase-1b-runtime-shell.md` — approved-asset promotion, typed lifecycle/recovery and empty 3D music-zone runtime.
3. `docs/superpowers/plans/2026-08-22-yue-e-phase-1c-app-integration-release.md` — app entry/exclusivity, real-browser proof, packaging/regressions and USER GATE B.

## Global Constraints

- 本计划只实施规格第 24 节的阶段 1；每个用户闸门都必须停止，不能自动进入下一段或下一阶段。
- 角色以三张已批准视觉锚点为准，但资产必须原创；不得导入、解包或复制《光·遇》的模型、贴图、骨骼、动画或其他受保护资产。
- 候选 lookdev 资产在用户批准前只存在于 `docs/superpowers/assets/yue-e/lookdev/`，不得进入 `web/` 或任何安装包。批准后只把相同 SHA-256 的 lookdev GLB 提升为阶段 1 运行依赖；最终 `yue-e-traveler.glb` 仍留到阶段 3。
- 角色必须是真实体积网格、真实 Armature、真实蒙皮和可响应光照/阴影的材质；二维图片、广告牌、平面贴图替身或不可变雕像均不通过。
- lookdev 使用米制、`+Y` 向上、角色朝向 `-Z`、双脚中点为原点；静止高目标 1.35m（允许 1.30–1.40m），4.5 头身，LOD0 为 35k–60k 三角形，骨骼不超过 96，单顶点最多 4 个影响。
- lookdev 不制作也不假装完成阶段 3 的动作集；GLB 的 `animations` 必须为空。走跑跳等动作在阶段 2/3 基于已批准的同一源模型制作。
- 阶段 1 GLB 使用普通 glTF 2.0、自包含 BIN、无外部 URI，不启用 DRACO、Meshopt、KTX2 或运行时尚未配置的扩展；浏览器兼容性以 vendored r128 为准，而不是只看 npm r185。
- 所有浏览器 ESM 的静态/动态相对 import 都使用同一个 `?v=20260821-yue-e-phase1-1` 查询键；GLB 由 manifest 内已批准 SHA 的 12 位前缀做缓存键。
- `#audio` 是唯一主播放器。进入、加载、失败、重试、退出和释放过程均不得调用或改写其 `play()`、`pause()`、`load()`、`src`、`currentSrc`、`currentTime` 或队列状态。
- 新三维内容只有在资产、场景、渲染器均 ready 且连续 3 帧健康后才以 520ms 交叉淡入；错误发生在此之前时，原应用保持可见、可操作、继续播放，不允许黑屏或突然出现。
- 运行时公开面固定为 `mount(dependencies) / enter(options) / exit(reason) / snapshot() / restore(snapshot) / dispose()`；内部不得读取 `window.state` 或 `window.els`。
- 所有退出/恢复路径必须幂等：Escape、退出按钮、`pagehide`、`beforeunload`、可见性变化和 WebGL context loss 不得累积 RAF、监听器、ResizeObserver、WebGL 资源或重复恢复 UI。Context loss 在同一个仍存活的 runtime 内走恢复子状态，只有恢复失败/超时才安全退出。
- 当前工作树已有大量用户改动。实现者必须先读 `git status --short` 和相关文件 diff，保留全部无关改动；新文件可直接暂存，预先脏的共享文件必须用 `git add -p -- <path>` 只暂存遇E区块，并用 `git diff --cached --check` 与 `git diff --cached` 核验。
- 文件手工编辑一律使用 `apply_patch`；Blender/浏览器生成的 `.blend`、`.glb`、PNG 和 JSON 报告属于构建产物，可由相应构建脚本写出。

## Fixed Contracts

### 角色外观与材质

`web/yue-e/character/lookdev-contract.js` 是唯一机器可读合约，至少固定以下值：

```js
export const YUE_E_LOOKDEV = Object.freeze({
  version: 1,
  stage: "lookdev",
  units: "meters",
  upAxis: "+Y",
  forwardAxis: "-Z",
  approvedLod: 0,
  semanticIdPrefix: "yue-e.lod0.",
  targetHeightMeters: 1.35,
  allowedHeightMeters: Object.freeze([1.30, 1.40]),
  headRatio: 4.5,
  triangleRange: Object.freeze([35_000, 60_000]),
  maxBones: 96,
  maxInfluencesPerVertex: 4,
  wingPanelCount: 12,
  requiredAnimationClips: Object.freeze([]),
  materials: Object.freeze({
    YE_Visor:       { base: "#081426", roughness: 0.34, metalness: 0.04 },
    YE_Hair:        { base: "#F3F1E8", roughness: 0.62, metalness: 0.00, emissive: "#171713", emissiveStrength: 0.06 },
    YE_Tunic_Ivory: { base: "#F1E6CF", roughness: 0.76, metalness: 0.00 },
    YE_Coral_Trim:  { base: "#E88768", roughness: 0.70, metalness: 0.00 },
    YE_Shorts:      { base: "#172642", roughness: 0.82, metalness: 0.00 },
    YE_Boots:       { base: "#E8DDC8", roughness: 0.78, metalness: 0.00 },
    YE_Chest_Core:  { base: "#FFC968", roughness: 0.28, metalness: 0.00, emissive: "#FFC968", emissiveStrength: 1.00 },
    YE_Gravity_Tool:{ base: "#54D8D0", roughness: 0.24, metalness: 0.12, emissive: "#2ABCB8", emissiveStrength: 0.85 },
    YE_Wing_Glass:  { base: "#CFEFF1", roughness: 0.30, metalness: 0.00, opacity: 0.72, alphaMode: "BLEND" },
    YE_Exposed:     { base: "#3A2628", roughness: 0.72, metalness: 0.00 }
  })
});
```

造型必须直接体现：4.5 头身、深靛无五官面罩与两道琥珀短光、珍珠白块面头发、象牙/珊瑚短袍、深夜蓝蓬松短裤、奶油靴、胸口琥珀光核、右腕青绿引力工具、左右各 6 片有厚度的磨砂玻璃音翼。音翼只用 glTF 标准 alpha blend/roughness，不使用 r128 不支持的 transmission 扩展。

骨骼名称固定为：

```text
Root, Hips, Spine, Chest, Neck, Head, HairRoot, ChestCore,
Clavicle_L, UpperArm_L, LowerArm_L, Hand_L,
Clavicle_R, UpperArm_R, LowerArm_R, Hand_R,
Thigh_L, Shin_L, Foot_L, Toe_L,
Thigh_R, Shin_R, Foot_R, Toe_R,
WingRoot_L, Wing01_L, Wing02_L, Wing03_L, Wing04_L, Wing05_L, Wing06_L,
WingRoot_R, Wing01_R, Wing02_R, Wing03_R, Wing04_R, Wing05_R, Wing06_R,
ToolRoot_R
```

父子层级同样属于批准合约，不能只对上名字：`Root:null`；`Hips:Root`；`Spine:Hips`；`Chest:Spine`；`Neck:Chest`；`Head:Neck`；`HairRoot:Head`；`ChestCore:Chest`；左右锁骨接 `Chest`，并依次为 `UpperArm -> LowerArm -> Hand`；左右大腿接 `Hips`，并依次为 `Shin -> Foot -> Toe`；左右 `WingRoot` 接 `Chest`，同侧 `Wing01..06` 均接对应 `WingRoot`；`ToolRoot_R` 接 `Hand_R`。`lookdev-contract.js` 必须以 `REQUIRED_BONE_PARENTS` 导出该完整映射。

### 运行时状态与依赖

生命周期允许的状态和边固定如下：

```text
idle -> mounted | disposed
mounted -> loading | exiting | disposed
loading -> ready | error | exiting | disposed
ready -> entering | error | exiting | disposed
entering -> active | error | exiting | disposed
active -> exiting | error | disposed
error -> loading | exiting | disposed
exiting -> mounted | disposed
disposed -> no transitions
```

每次 `enter()`/`exit()` 增加单调 `operationToken`；迟到的 fetch、GLTF parse 或 RAF 只能释放自己的结果，不能激活旧操作。`enter()` 同一 token 内 single-flight，`exit()` 可取消尚未完成的 enter，`dispose()` 可重复调用。

公开 `mount()` 只接收规格批准的领域适配器：

```ts
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
```

阶段 1 只读取 `playerCommands.snapshot()` 用于连续性诊断，不调用播放控制；其余领域适配器完成挂载契约但尚不迁移 DOM、不发成就、不启动空间声源。Three/DOM/fetch/RAF 等平台细节不进入 `mount()`，而是在实例创建时由主应用调用内部工厂：

```js
createYueERuntime({
  three: window.THREE,
  ensureGltfLoader: ensureSandboxGltfLoader,
  createRenderer: (three, options) => createDirectX11Renderer(three, options),
  elements: { root, canvas, status, recovery, retryButton, exitButton },
  fetch: window.fetch.bind(window),
  cryptoSubtle: window.crypto.subtle,
  requestFrame: window.requestAnimationFrame.bind(window),
  cancelFrame: window.cancelAnimationFrame.bind(window),
  now: () => performance.now(),
  setTimer: window.setTimeout.bind(window),
  clearTimer: window.clearTimeout.bind(window),
  resizeObserverFactory: callback => new ResizeObserver(callback),
  prefersReducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  waitForSurfaceTransition: createSurfaceTransitionWait,
  setBaseRenderSuspended: (suspended, reason) => setWorldRenderSuspended("yue-e", suspended, reason),
  setBaseSurfaceObscured: hidden => els.appShell.classList.toggle("yue-e-active", hidden),
  onPhase: detail => syncYueEPhase(detail)
})
```

`createYueERuntime(platform)` 只由 `web/app.js` 使用；`window.FeYueE` 仍只暴露六个规格方法。

公开 `snapshot()` 固定返回可版本化状态，并把只读诊断放在独立字段；`restore()` 只消费 `version/durable/volatileRecovery`，忽略传入的 `diagnostics`：

```js
{
  version: 2,
  durable: {
    cameraMode: "third-person",
    world: { seedVersion: 1, visitedRegions: [], discoveredLandmarks: [] },
    musicZone: { panelTransforms: {}, focusedPresetId: null },
    accessibility: { cameraShake: 0.15, fovFirstPerson: 78, fovThirdPerson: 50 }
  },
  volatileRecovery: null,
  diagnostics: {
    phase,
    recoveryPhase,
    operationToken,
    stableFrames,
    rafRunning,
    baseRenderSuspended,
    listenerCount,
    resources: { geometries, materials, textures, renderTargets },
    assetSha256,
    errorCode,
    recovery: { runtimeId, capturedAt, attempts }
  }
}
```

`volatileRecovery` 非空时严格为 `{runtimeId,logicalPosition:[x,y,z],logicalRotation,movementMode:"ground",capturedAt}`，仅能在相同仍存活 runtime、年龄 ≤10 秒且碰撞 ready 时使用。`restore(snapshot)` 先完整验证再一次性提交，返回 `{restored:true,spawn:"music-zone"|"volatile"}`；损坏/未知版本返回 `{restored:false,reason:"invalid",spawn:"music-zone"}`，保持此前遇E状态不变且不抛出原始数据。正常退出后重进、页面重载或应用重启一律在音乐区重生；重复恢复同一规范化快照幂等。快照不得包含歌曲进度、歌单内容或可恢复播放器状态。

## Deferred by Scope

- 阶段 2：走跑跳、第三人称风险切片、单草原块、单实时预设、单真实歌单 DOM 与首个空间音源。
- 阶段 3：完整动作集、最终运行 GLB、滑翔/攀爬/翻越/IK、第一/第三人称与滑翔相机。
- 阶段 3 的最终运行 GLB 同时交付规格要求的约 50%/20% LOD1/LOD2；阶段 1 lookdev 只锁 LOD0 外观/骨骼源。
- 阶段 4：完整高空巨大音乐区 UI、全部预设适配与真实 DOM 无损迁移。
- 阶段 5：拖动枪移动、缩放、旋转与持久化。
- 阶段 6：256m 分块、六域、无边界世界、原点重置与无 pop-in。
- 阶段 7：完整空间音频、六域环境声与非战斗冒险。
- 阶段 8：10 项成就、参考硬件性能、清晰度与最终回归。

---

## Task 1: 固定可执行的角色 lookdev 合约

**Files:**

- Create: `web/yue-e/package.json`
- Create: `web/yue-e/character/lookdev-contract.js`
- Create: `scripts/check-yue-e-lookdev-contract.mjs`
- Read: `docs/superpowers/assets/yue-e/e-traveler-approved.png`
- Read: `docs/superpowers/assets/yue-e/e-traveler-actions-approved.png`
- Read: `docs/superpowers/assets/yue-e/camera-views-approved.png`

**Interfaces:**

- `lookdev-contract.js` exports frozen `YUE_E_LOOKDEV`, `REQUIRED_BONES`, `REQUIRED_BONE_PARENTS`, `REQUIRED_MATERIALS`, `APPROVED_ANCHORS`, `YUE_E_RESOURCE_IDS` and the three repository-relative lookdev paths. The stage-1 manifest ID is exactly `yue-e.traveler.lookdev.manifest`.
- `node scripts/check-yue-e-lookdev-contract.mjs` takes no arguments, exits non-zero on mismatch and prints one final JSON report on success.

- [ ] **RED — 先写独立视觉 oracle 检查。**

  `scripts/check-yue-e-lookdev-contract.mjs` 使用 `node:assert/strict`、`createHash("sha256")` 与 PNG IHDR 偏移 16/20，先断言三个批准锚点的尺寸与 SHA-256，再 import 尚不存在的合约：

  ```js
  const anchors = [
    ["e-traveler-approved.png", 1536, 1024, "FE9724E075730551AC657D93C81D3FFFA878C7E0A1D65F454FF890901D3F6F6D"],
    ["e-traveler-actions-approved.png", 1774, 887, "468E922942179B00659F5B16CAF7361D059B7CB6E2ACEEC947867F93DB4EEB55"],
    ["camera-views-approved.png", 1817, 866, "1429B87737E92FFFAABA44577AF3579556B558F488A2A88787D20F7653312FBF"]
  ];
  const { YUE_E_LOOKDEV, REQUIRED_BONES, REQUIRED_BONE_PARENTS, YUE_E_RESOURCE_IDS } = await import(
    "../web/yue-e/character/lookdev-contract.js"
  );
  assert.deepEqual(YUE_E_LOOKDEV.allowedHeightMeters, [1.30, 1.40]);
  assert.equal(YUE_E_LOOKDEV.headRatio, 4.5);
  assert.equal(YUE_E_LOOKDEV.approvedLod, 0);
  assert.equal(YUE_E_LOOKDEV.semanticIdPrefix, "yue-e.lod0.");
  assert.equal(YUE_E_LOOKDEV.wingPanelCount, 12);
  assert.equal(REQUIRED_BONES.length, 39);
  assert.deepEqual(Object.keys(REQUIRED_BONE_PARENTS).sort(), [...REQUIRED_BONES].sort());
  assert.equal(REQUIRED_BONE_PARENTS.ToolRoot_R, "Hand_R");
  assert.equal(REQUIRED_BONE_PARENTS.Wing06_L, "WingRoot_L");
  assert.equal(YUE_E_RESOURCE_IDS.travelerManifest, "yue-e.traveler.lookdev.manifest");
  assert.deepEqual(YUE_E_LOOKDEV.requiredAnimationClips, []);
  ```

- [ ] Run `node scripts/check-yue-e-lookdev-contract.mjs` and confirm it fails with `ERR_MODULE_NOT_FOUND` for `lookdev-contract.js`.

- [ ] **GREEN — 实现共享合约。**

  Add `web/yue-e/package.json` with exactly `{ "type": "module" }`. Implement and deeply freeze the fixed contract above; also export `REQUIRED_BONES`, `REQUIRED_BONE_PARENTS`, `REQUIRED_MATERIALS`, `APPROVED_ANCHORS`, `YUE_E_RESOURCE_IDS`, `LOOKDEV_CANDIDATE_PATH`, `LOOKDEV_GATE_PATH`, and `LOOKDEV_RUNTIME_PATH`. Do not read DOM or Node globals in this browser-shared module.

- [ ] Run `node scripts/check-yue-e-lookdev-contract.mjs`; expected output is JSON with `ok:true`, `anchorCount:3`, `boneCount:39`, `materialCount:10`.

- [ ] Commit only these new files:

  ```powershell
  git add web/yue-e/package.json web/yue-e/character/lookdev-contract.js scripts/check-yue-e-lookdev-contract.mjs
  git diff --cached --check
  git commit -m "test: lock Yue E traveler lookdev contract"
  ```

## Task 2: 用 Blender 生成真实三维源模型、骨骼和候选 GLB

**Files:**

- Create: `scripts/yue-e/build-traveler-lookdev.mjs`
- Create: `scripts/yue-e/blender/build_traveler_lookdev.py`
- Create: `scripts/check-yue-e-character-scene.mjs`
- Generate: `blender-source/yue-e/character/yue-e-traveler-lookdev.blend`
- Generate: `docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-lookdev.glb`
- Generate: `docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-material-palette.json`
- Generate: `docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-skeleton.md`
- Generate: `docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-proportion-board.png`
- Generate: `docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-build-report.json`

**Interfaces:**

- `node scripts/yue-e/build-traveler-lookdev.mjs --probe` only launches `blender.exe --version` and writes nothing; the build/check form is `--stage=lookdev [--check-only]`. `FE_BLENDER_EXE` may override discovery but not version validation.
- `build_traveler_lookdev.py` receives arguments only after Blender's `--`, returns process status, and prints one final JSON build/check report to stdout.
- `node scripts/check-yue-e-character-scene.mjs` runs the in-memory build and validates the report without writing artifacts.

- [ ] **RED 2.1 — 先写 Blender probe。** Add only the `probe` case to `scripts/check-yue-e-character-scene.mjs`; it spawns the missing wrapper with `--probe`, expects version `5.1.2`, exact build hash `ec6e62d40fa9` and no absolute path in JSON. Run `node scripts/check-yue-e-character-scene.mjs --case=probe`; confirm missing-wrapper failure.

- [ ] **GREEN 2.1 — 实现确定性 Blender wrapper。**

  `build-traveler-lookdev.mjs` resolves Blender in this exact order: `FE_BLENDER_EXE`, `E:\\New Folder\\blender.exe`, then standard Program Files candidates. It runs `--background --factory-startup --python scripts/yue-e/blender/build_traveler_lookdev.py -- --stage lookdev`; `--check-only` builds in memory and prints one final JSON line, normal mode writes all generated artifacts. Never commit the absolute Blender path into an asset manifest.

  The wrapper must require Blender version `5.1.2` and build hash `ec6e62d40fa9` exactly (including when `FE_BLENDER_EXE` is supplied), propagate non-zero exit codes, normalize all output paths under the repository, and pass `--check-only` without writing source or assets. A future Blender upgrade requires a separately reviewed contract/build-hash change rather than silently changing exported bytes.

- [ ] Run `node scripts/check-yue-e-character-scene.mjs --case=probe`; require green before writing Blender scene code.

- [ ] **RED 2.2 — 加入几何/材质 case。** Extend the checker with `--case=geometry`; require exact material names, true-volume mesh parts for every approved silhouette feature, 12 wing panels, authored 1.30–1.40m bounds, floor/origin/forward markers, and 35k–60k evaluated triangles. Run it and confirm failure because the Python builder/geometry is absent.

- [ ] **GREEN 2.2 — 实现可复现的外观几何。**

  `build_traveler_lookdev.py` must create geometry, not planes. Its internal typed helpers are `create_bone(armature,name,head,tail,parent) -> EditBone`, `add_skinned_part(name,mesh_data,bone_name,material_name) -> Object`, `assign_rigid_weight(obj,bone_name) -> None`, and `assert_scene_contract(scene,contract) -> dict`; each returns a concrete object/report or raises a descriptive `RuntimeError`, never a partial result.

  Build the approved silhouette with smooth low-poly primitives and bevelled custom profiles: ellipsoid visor, two separate amber dash meshes, chunky pearl hair clumps, tapered layered tunic, coral hem, voluminous shorts, articulated limbs, thick boots, chest core, right wrist tool, and twelve thin extruded rounded wing panels. Use Blender-native `+Z` up and character-front `+Y`; export with `export_yup=True`, which must validate as glTF `+Y` up and character-front `-Z`. Use enough clean subdivision/bevel segments to land within 35k–60k triangles while keeping visible facet scale intentional and free of pixel noise.

  Set every visible mesh object's custom `yueERegion` to exactly `body`, `wing` or `tool`, `yueELod` to numeric `0`, and `yueESemanticId` to a unique stable ID beginning `yue-e.lod0.`; visor/hair/clothing/limbs/boots/core are `body`, twelve panels are `wing`, wrist device is `tool`. The ID is assigned from the semantic part name, never from creation order, and cannot be added or renamed after Gate A. Export these values with `export_extras=True`. The build report contains the sorted LOD0 semantic-ID set plus body-only `bodyBounds:{min,max}` and the true maximum per-vertex `bodyMaxRadialDistance`. Compute report vertices as evaluated Blender world coordinates followed by the exact export-axis conversion `(x,y,z) -> (x,z,-y)`, so every report bound/radius is already in glTF `+Y`-up/`-Z`-forward world space before comparison with the exported GLB.

  Run `node scripts/check-yue-e-character-scene.mjs --case=geometry`; do not proceed until the geometry/material/origin report is green.

- [ ] **RED 2.3 — 加入 armature/skin/deformation case。** Extend the checker with `--case=rig`; require one Armature, exact 39-bone names/parents, non-empty localized weights, ≤4 influences, no dominant root shortcut, and five deformation probes. Run it and confirm the geometry-only scene fails.

- [ ] **GREEN 2.3 — 实现真实骨骼、蒙皮和变形探针。**

  Create one Armature with the 39 fixed bones and exact `REQUIRED_BONE_PARENTS` hierarchy. Every visible mesh receives an Armature modifier and non-empty vertex groups; rigid parts may use weight 1.0 to their semantic bone, while shoulders/elbows/hips/knees use normalized blends across adjacent bones. Join compatible mesh objects only after preserving vertex groups/material slots. There must be no dummy invisible skin used merely to satisfy the validator, and no single bone may own more than 45% of all weighted vertices.

  The Blender self-check must temporarily pose `LowerArm_L`, `Shin_R`, `Wing03_L`, `Wing05_R` and `ToolRoot_R` by 12° one at a time, evaluate the deformed mesh, and prove that a non-empty, spatially local vertex set moves while unrelated opposite-side vertices remain within tolerance; restore the rest pose before save/export. This rejects a correctly named skeleton whose visible mesh is effectively all weighted to `Root`.

  Run `node scripts/check-yue-e-character-scene.mjs --case=rig`; require all hierarchy/weight/deformation assertions green.

- [ ] **RED 2.4 — 加入 artifact case。** Extend the checker with `--case=artifacts`; require `.blend`, candidate GLB, palette, skeleton table, proportion board and build report with non-zero expected sizes and hashes. Run it and confirm failure before save/render/export.

- [ ] **GREEN 2.4 — 保存源、渲染比例板并导出 GLB。**

  Configure color management to AgX/medium-high contrast, a neutral studio world, one soft key, one cool fill, and one warm rim. Render a 3200×1800 transparent-free proportion board containing front/side/back orthographic views, a 1.35m scale guide, 4.5-head guide lines, material swatches, and labels. Save the `.blend` before exporting the same evaluated scene as self-contained glTF 2.0 GLB. Pass every byte-affecting exporter option explicitly: `export_format='GLB'`, `export_yup=True`, `export_extras=True`, `export_skins=True`, `export_apply=False`, `export_influence_nb=4`, `export_all_influences=False`, `export_animations=False`, `export_cameras=False`, `export_lights=False`, and `export_draco_mesh_compression_enable=False`; do not inherit these from Blender defaults. Keep emissive strength at or below 1 so Blender does not emit `KHR_materials_emissive_strength`, which the r128 gate does not accept.

- [ ] Run the in-memory source check, then build the candidate:

  ```powershell
  node scripts/check-yue-e-character-scene.mjs
  node scripts/yue-e/build-traveler-lookdev.mjs --stage=lookdev
  ```

  Expected report: Blender `5.1.2`/`ec6e62d40fa9`, one armature, at least one visible skinned mesh, exact parent hierarchy, 39 unique bones, 12 wing panels, unique stable LOD0 semantic IDs, zero unweighted vertices, maximum 4 influences, all five source deformation probes passing, root transform identity, floor `minY` within ±0.005m, feet midpoint within 0.01m of X/Z origin, forward marker at `-Z`, glTF-coordinate body metrics, height in range and triangles in range.

- [ ] Open the generated build report and confirm it records Blender version/build hash, scene metrics, material names, source hash and output hash, but no local absolute path.

- [ ] Commit source, wrapper, check, `.blend`, candidate GLB and generated review documents:

  ```powershell
  git add scripts/yue-e/build-traveler-lookdev.mjs scripts/yue-e/blender/build_traveler_lookdev.py scripts/check-yue-e-character-scene.mjs blender-source/yue-e/character docs/superpowers/assets/yue-e/lookdev
  git diff --cached --check
  git commit -m "feat: build rigged Yue E traveler lookdev"
  ```

## Task 3: 用原始 GLB 解析器锁住资产完整性

**Files:**

- Create: `scripts/yue-e/lib/glb-v2.mjs`
- Create: `scripts/check-yue-e-glb-parser.mjs`
- Create: `scripts/check-yue-e-character-asset.mjs`
- Generate: `docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json`

**Interfaces:**

- `readGlbV2(Buffer) -> { magic, version, declaredLength, byteLength, json, bin, chunks }` and `readAccessor(document,bin,index) -> TypedArray|number[][]` reject malformed ranges/types.
- `validateYueELookdev(document,bin,contract) -> GateReport` returns metrics/errors without writing; `canonicalRigFingerprint(report) -> uppercase SHA-256` locks skeleton/bind/weights, while `canonicalApprovedLod0Fingerprint(report,document,bin) -> uppercase SHA-256` locks the complete approved LOD0 visual subset. Both remain stable across animation-only additions and new primitives explicitly marked with `yueELod > 0`.
- `node scripts/check-yue-e-character-asset.mjs --stage=lookdev [--write-gate]` validates and optionally writes only the pending gate.
- `node scripts/check-yue-e-glb-parser.mjs [--case=container|accessors]` runs both parser cases when `--case` is omitted and rejects every unknown case value.

- [ ] **RED 3.1 — 先写 GLB header/chunk 合成夹具。** `check-yue-e-glb-parser.mjs --case=container` constructs valid/tampered byte buffers in memory and requires correct magic/version/declared length/aligned JSON+BIN parsing plus rejection of duplicate/missing/out-of-range chunks. Run it and confirm `glb-v2.mjs` is missing.

- [ ] **GREEN 3.1 — 只实现容器解析。** Implement `readGlbV2(buffer)` for the 12-byte header and aligned JSON/BIN chunks. Run the container case green before adding accessor code.

- [ ] **RED 3.2 — 加入 accessor 合成夹具。** Add `--case=accessors` covering combined offsets, interleaved `byteStride`, normalized integer values, SCALAR/VEC2/VEC3/VEC4/MAT4, illegal 5124, sparse rejection and out-of-range reads. Run it and confirm failure.

- [ ] **GREEN 3.2 — 只实现 accessor/矩阵解码。** Decode the glTF-legal component types `5120, 5121, 5122, 5123, 5125, 5126`, explicitly reject 5124, honor offsets/stride/normalization, and reject sparse accessors. Run both parser cases green.

- [ ] **RED 3.3 — 再写候选资产语义验收。**

  The checker imports a missing `readGlbV2()` and asserts the candidate. Its `--stage=lookdev` profile must cover:

  ```js
  assert.equal(glb.magic, "glTF");
  assert.equal(glb.version, 2);
  assert.equal(glb.declaredLength, glb.byteLength);
  assert.equal(report.externalUriCount, 0);
  assert.equal(report.unsupportedCompressionExtensions.length, 0);
  assert.equal(report.skinCount >= 1, true);
  assert.equal(report.visibleSkinnedMeshCount >= 1, true);
  assert.equal(report.bones.length <= 96, true);
  assert.deepEqual(new Set(report.bones), new Set(REQUIRED_BONES));
  assert.equal(report.duplicateBoneNames.length, 0);
  assert.deepEqual(report.boneParents, REQUIRED_BONE_PARENTS);
  assert.equal(report.invalidInverseBindMatrices.length, 0);
  assert.equal(report.bindPoseMaxResidual <= 1e-4, true);
  assert.deepEqual(report.exportedPoseProbes.map(({ bone, passed }) => [bone, passed]), [
    ["LowerArm_L", true], ["Shin_R", true], ["Wing03_L", true],
    ["Wing05_R", true], ["ToolRoot_R", true]
  ]);
  assert.equal(report.negativeScaleNodes.length, 0);
  assert.equal(report.rootTransformIsIdentity, true);
  assert.equal(Math.abs(report.bounds.min[1]) <= 0.005, true);
  assert.equal(report.feetMidpointDistanceFromOrigin <= 0.01, true);
  assert.equal(report.forwardMarkerAxis, "-Z");
  assert.equal(report.unboundVisibleMeshes.length, 0);
  assert.equal(report.maxInfluencesPerVertex <= 4, true);
  assert.equal(report.unweightedVertexCount, 0);
  assert.equal(report.wingJointCount, 12);
  assert.equal(report.lod0SemanticIds.length > 0, true);
  assert.equal(new Set(report.lod0SemanticIds).size, report.lod0SemanticIds.length);
  assert.match(report.approvedLod0FingerprintSha256, /^[A-F0-9]{64}$/);
  assert.equal(report.triangles >= 35_000 && report.triangles <= 60_000, true);
  assert.equal(report.heightMeters >= 1.30 && report.heightMeters <= 1.40, true);
  assert.deepEqual(report.animations, []);
  ```

- [ ] Run `node scripts/check-yue-e-character-asset.mjs --stage=lookdev`; confirm semantic validation fails because `validateYueELookdev` is not implemented.

- [ ] **GREEN 3.3 — 实现资产语义、变换和 skin 验证。**

  Add indexed/non-indexed triangle counting, node TRS/matrix evaluation, determinant and transformed POSITION bounds. This profile rejects non-TRIANGLES primitive modes instead of silently misreading them.

  Validate that each skin has a `FLOAT`/`MAT4` `inverseBindMatrices` accessor with `count === joints.length` and only finite values, every joint index is valid, joint ancestry exactly matches `REQUIRED_BONE_PARENTS`, every skinned primitive has `JOINTS_0` and `WEIGHTS_0`, no primitive has `JOINTS_1`/`WEIGHTS_1`, and each vertex has 1–4 non-zero normalized influences. For every node/skin pair, evaluate glTF rest-world matrices and require `inverse(meshWorld) * jointWorld * inverseBindMatrix` to be identity within `1e-4`; record the maximum residual. Reject a root joint with non-identity TRS/matrix, any bone owning more than 45% of weights, floor bounds outside ±0.005m, off-center feet, or a named `ForwardMarker` that is not in front at `-Z`. Images, if any, must use a GLB `bufferView` and be at most 2048×2048; this lookdev may use material colors with no textures.

  Run an exported-byte CPU skinning smoke after those bind checks: temporarily rotate each of `LowerArm_L`, `Shin_R`, `Wing03_L`, `Wing05_R` and `ToolRoot_R` by 12° in its glTF local rest frame, propagate descendant world matrices, evaluate `POSITION/JOINTS_0/WEIGHTS_0` using the same mesh-space joint formula, and require eligible weighted vertices to move by at least 0.002m while explicitly unrelated opposite-side control vertices remain within 0.0005m. Restore the rest matrices after each probe and return the five typed results in `exportedPoseProbes`. This post-export check—not only Blender's pre-export probe—is part of the approval gate.

  Require every visible mesh node to carry `extras.yueERegion` in the fixed three-value set, `extras.yueELod === 0`, and a unique stable `extras.yueESemanticId` beginning `yue-e.lod0.`. Recompute `bodyBounds` and the true maximum per-vertex `bodyMaxRadialDistance` from only LOD0 `body` primitives after node transforms; require finite values, floor Y=0, containment within full bounds, and equality with the Blender report's already-converted glTF world coordinates within 0.001m. Include the sorted LOD0 semantic IDs, region tags/body metrics, bind residual and exported pose results in the canonical rig fingerprint input.

  Produce `rigFingerprintSha256` by canonical-JSON hashing the joint names, parent indices, rest global matrices, inverse bind matrices, and only the approved `yueELod === 0` skinned nodes/primitives ordered by `yueESemanticId`, material name and primitive ordinal: POSITION/index bytes plus per-vertex JOINTS/WEIGHTS bytes. New LOD1/LOD2 nodes are excluded only when explicitly tagged `yueELod > 0`; changing, deleting or duplicating any approved LOD0 semantic ID remains a failure. This fingerprint, separate from the whole-file SHA, lets stages 2/3 prove they continue from the approved rest geometry/rig after adding animation chunks or separately tagged lower LODs.

  Separately produce `approvedLod0FingerprintSha256` over the same sorted LOD0 semantic nodes but include primitive mode and material assignment, raw index bytes, every present vertex attribute/accessor descriptor+bytes (`POSITION`, `NORMAL`, `TANGENT`, `TEXCOORD_n`, `COLOR_n`, `JOINTS_n`, `WEIGHTS_n`), node transforms/extras, canonical PBR/alpha/double-sided/emissive material values, sampler/texture wiring, and exact embedded image bytes. Reject external images or unsupported attributes instead of omitting them. Stage 2/3 continuation must preserve both fingerprints; animations and explicitly tagged LOD1/LOD2 data are outside this visual fingerprint.

  Run `node scripts/check-yue-e-character-asset.mjs --stage=lookdev`; require the full semantic report green.

- [ ] **RED 3.4 — 写 gate serialization/hash invalidation case。** Add a temporary-output case that requires pending approval fields, all three anchor hashes, contract hash, GLB hash, rig fingerprint and actual metrics; changing any source hash must invalidate the gate. Run it before writer implementation and confirm failure.

- [ ] **GREEN 3.4 — 生成待批准 gate。**

  `check-yue-e-character-asset.mjs` writes `yue-e-traveler-gate.json` only with `--write-gate`. The typed schema is `version:1`, `stage:"lookdev"`, three `{path,sha256}` anchors, full `lookdevContractSha256`, full `rigFingerprintSha256`, full `approvedLod0FingerprintSha256`, `model:{path,sha256,metrics}` where metrics include `bodyBounds/bodyMaxRadialDistance/lod0SemanticIds/bindPoseMaxResidual/exportedPoseProbes`, `build:{blenderVersion:"5.1.2",blenderBuildHash:"ec6e62d40fa9"}`, and `approval:{status:"pending",approvedModelSha256:null,approvedAt:null}`. It is deterministic except `generatedAt`.

- [ ] Run:

  ```powershell
  node scripts/check-yue-e-character-asset.mjs --stage=lookdev --write-gate
  node scripts/check-yue-e-character-asset.mjs --stage=lookdev
  ```

  Expected result includes exact GLB SHA-256, 39 bones, 12 wing joints, 10 required material slots, 0 animations and `approval.status:"pending"`.

- [ ] Commit the parser, validator and pending gate:

  ```powershell
  git add scripts/yue-e/lib/glb-v2.mjs scripts/check-yue-e-glb-parser.mjs scripts/check-yue-e-character-asset.mjs docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json
  git diff --cached --check
  git commit -m "test: validate Yue E traveler GLB integrity"
  ```

## Task 4: 交付 r128 交互转台并执行用户外观闸门

**Files:**

- Create: `docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.html`
- Create: `docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.css`
- Create: `docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.js`
- Create: `scripts/check-yue-e-lookdev-browser.mjs`
- Create: `scripts/check-yue-e-approval-gate.mjs`
- Create: `scripts/yue-e/approve-traveler-lookdev.mjs`
- Generate: `artifacts/yue-e/phase-1/lookdev-000.png`
- Generate: `artifacts/yue-e/phase-1/lookdev-045.png`
- Generate: `artifacts/yue-e/phase-1/lookdev-090.png`
- Generate: `artifacts/yue-e/phase-1/lookdev-135.png`
- Generate: `artifacts/yue-e/phase-1/lookdev-180.png`
- Generate: `artifacts/yue-e/phase-1/lookdev-225.png`
- Generate: `artifacts/yue-e/phase-1/lookdev-270.png`
- Generate: `artifacts/yue-e/phase-1/lookdev-315.png`

**Interfaces:**

- `window.__yueELookdevReview` exposes only `setAngle(number)`, `sampleFrame()`, `snapshot()` and `dispose()`.
- `node scripts/check-yue-e-lookdev-browser.mjs` runs the automated probe and exits; `--serve --port=0` instead prints the allocated review URL and remains alive for the user gate.
- `node scripts/yue-e/approve-traveler-lookdev.mjs --approved-by=user --model-sha=SHA [--root=ROOT --gate=REL --candidate=REL --contract=REL]` writes only verified approval fields.

- [ ] **RED — 先写真实浏览器转台探针。**

  Clone only the bounded HTTP/Edge/CDP helpers from `scripts/check-main-boot-ready-browser.mjs`. Serve repository root with safe path resolution, then open:

  ```text
  /docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.html?asset=/docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-lookdev.glb
  ```

  For each 45° angle, call `window.__yueELookdevReview.setAngle(angle)`, await two rendered frames, require `snapshot().ready === true`, exact candidate SHA, all three approved anchor hashes/dimensions, at least one SkinnedMesh, exact bone/material sets, 12 wing panels, unique approved LOD0 semantic IDs, empty animations and authored height range; assert the reference rail and front/side/back/top live view labels are visible. Before `ready` may become true, require r128 `poseProbeResults` for `LowerArm_L`, `Shin_R`, `Wing03_L`, `Wing05_R` and `ToolRoot_R`, each with `passed:true`, moved eligible vertices and stable opposite-side controls. Then require `sampleFrame()` to have non-zero alpha, luminance variance above 0.01 and model-only mask coverage between 20% and 70% of the main viewport. Save a CDP PNG and assert no console error, page exception, failed request or WebGL context loss. The model-only mask must be rendered to a separate object-ID target so background, ruler and lights cannot satisfy coverage.

- [ ] Run `node scripts/check-yue-e-lookdev-browser.mjs`; confirm it fails because the review page is absent.

- [ ] **GREEN — 实现一个真正的 3D 评审页。**

  Load only `/web/vendor/three.r128.min.js` and `/web/vendor/GLTFLoader.r128.js`. Do not use npm Three, CDN, `<img>` stand-ins or automatic model fit. Use the authored meter scale and a fixed neutral studio rig. Render one WebGL canvas with:

  - a large draggable/wheel-zoom perspective turntable;
  - fixed front, right, back and top comparison viewports using scissor rectangles;
  - buttons for 0/45/90/135/180/225/270/315 degrees;
  - visible 1.35m ruler, origin cross, bone toggle, material toggle and model SHA-256;
  - DPR-capped antialiasing, sRGB output, ACES tone mapping, soft shadows and no film grain.
  - the three approved concept anchors in a separate reference rail, with their verified dimensions/SHA shown beside live front/side/back/top renders; references remain visibly labelled “概念锚点”, never presented as the model itself.

  After GLTFLoader r128 has built its real `SkinnedMesh`/`Skeleton` objects and before setting `ready`, run the same five 12° probes against the browser-loaded asset: capture eligible and opposite-side control vertex positions with `SkinnedMesh.boneTransform`, rotate only the named `Bone`, call `updateMatrixWorld(true)`/`skeleton.update()`, require the same 0.002m movement and 0.0005m control thresholds, then restore the exact quaternion and update again. Also render one object-ID frame for each rest/posed pair and require a non-empty local mask delta so the browser's actual skin path—not a copied Node report—proves deformation. Any failed probe keeps the viewer unready and blocks Gate A.

  Expose a frozen diagnostic facade:

  ```js
  window.__yueELookdevReview = Object.freeze({
    setAngle,
    sampleFrame,
    snapshot,
    dispose
  });
  ```

  `snapshot()` must report `ready`, asset SHA, authored bounds, `SkinnedMesh` count, bone names, material names, sorted LOD0 semantic IDs, wing panel count, animation names, five typed `poseProbeResults`, model coverage, active angle, all three reference anchor sizes/hashes and errors.

- [ ] Run `node scripts/check-yue-e-lookdev-browser.mjs`; confirm the r128 viewer produces all eight validated screenshots before adding approval mutation code.

- [ ] **RED — 写批准锁篡改测试。** In a `mkdtemp()` directory, copy the pending gate, contract and candidate, pass that generated absolute directory as `--root` together with `--gate=gate.json --candidate=model.glb --contract=lookdev-contract.js`, and assert: a wrong/partial hash exits non-zero; an exact hash changes only approval fields; mutating one candidate or contract byte makes subsequent gate validation fail. Run `node scripts/check-yue-e-approval-gate.mjs` and confirm it fails because the approval script is absent.

- [ ] **GREEN — 实现受约束的批准记录器。** `approve-traveler-lookdev.mjs` requires `--approved-by=user`, a complete 64-character uppercase SHA and an already-passing pending gate. `--root` defaults to repository root; `--gate`/`--candidate`/`--contract` are always resolved as relative paths inside that verified root, with traversal and absolute-path input rejected. It rewrites only `approval.status`, `approvedModelSha256` and `approvedAt`, and refuses any anchor/model/contract/rig mismatch.

- [ ] Run the approval check and the viewer once more; confirm approval tamper coverage, eight screenshots and JSON `ok:true` reports:

  ```powershell
  node scripts/check-yue-e-lookdev-browser.mjs
  node scripts/check-yue-e-approval-gate.mjs
  ```

- [ ] Commit review code only; generated test screenshots may remain as review artifacts rather than source:

  ```powershell
  git add docs/superpowers/assets/yue-e/lookdev/review scripts/check-yue-e-lookdev-browser.mjs scripts/check-yue-e-approval-gate.mjs scripts/yue-e/approve-traveler-lookdev.mjs
  git diff --cached --check
  git commit -m "feat: add Yue E traveler approval turntable"
  ```

- [ ] **USER GATE A — STOP.** Start `node scripts/check-yue-e-lookdev-browser.mjs --serve --port=0` in a resumable terminal session; it must print the concrete allocated localhost URL for `docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.html` and keep the same server alive until the user decides. Present that interactive URL, the 3200×1800 reference-vs-render proportion board and all eight r128 turntable frames. Ask specifically for approval of head/body ratio, visor spacing, hair silhouette, clothing volume, chest core, wrist tool, limb readability, material separation and twelve wing panels. Do not create `web/assets/yue-e/`, do not add the “场景” button, and do not start Task 5 until the user explicitly approves.

- [ ] Immediately after the user decision, terminate the resumable serve session, close all server connections and verify the printed localhost URL no longer accepts a connection before rebuilding/approving or entering Task 5.

- [ ] If rejected, change only Blender source/generator and visual contract values that the user requests; rebuild, rerun Tasks 2–4 checks, refresh the pending model SHA and show a new full turntable. Never retain `approved` across a changed model hash.

- [ ] After explicit approval, record it with the exact current SHA:

  ```powershell
  $lookdevGate = Get-Content -Raw -LiteralPath "docs\superpowers\assets\yue-e\lookdev\yue-e-traveler-gate.json" | ConvertFrom-Json
  $lookdevModelSha = [string]$lookdevGate.model.sha256
  node scripts/yue-e/approve-traveler-lookdev.mjs --approved-by=user "--model-sha=$lookdevModelSha"
  node scripts/check-yue-e-character-asset.mjs --stage=lookdev
  git add docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json
  git diff --cached --check
  git commit -m "chore: record Yue E traveler lookdev approval"
  ```

  The approval script must refuse a missing/partial/wrong hash, a failed static report, a changed anchor hash, a changed `lookdev-contract.js` hash, a changed canonical rig fingerprint, a changed approved LOD0 visual fingerprint, or any model whose current SHA differs from the pending gate.

## Task 5: 实现可取消、幂等的纯生命周期内核

**Files:**

- Create: `web/yue-e/core/lifecycle.js`
- Create: `web/yue-e/core/stable-frames.js`
- Create: `scripts/check-yue-e-runtime-state.mjs`

**Interfaces:**

- `createLifecycleMachine({onTransition}) -> LifecycleMachine` implements the fixed graph and stable exit descriptor.
- `waitForStableFrames({count,requestFrame,cancelFrame,isHealthy,signal,timeoutMs}) -> Promise<{stableFrames:number}>` owns and cancels exactly one pending RAF.
- `node scripts/check-yue-e-runtime-state.mjs` runs the six pure lifecycle tests.

- [ ] **RED — 用 `node:test` 写状态和帧门行为。**

  Use handwritten deferred promises, fake RAF and fake EventTargets; no jsdom dependency. Required test names:

  ```text
  lifecycle follows only the approved transition graph
  enter is single-flight for one operation token
  exit invalidates a stale loading operation
  concurrent beginExit while exiting returns the same descriptor and token
  stable-frame gate resets after one unhealthy frame
  dispose is idempotent from every non-disposed phase
  ```

  The stable-frame test advances healthy, healthy, unhealthy, healthy, healthy, healthy and expects resolution only on the sixth sample.

- [ ] Run `node scripts/check-yue-e-runtime-state.mjs`; confirm module-not-found failure.

- [ ] **GREEN — 实现纯状态机。**

  `createLifecycleMachine({ onTransition })` returns `phase`, `operationToken`, `mount()`, `beginEnter()`, `markReady(token)`, `markEntering(token)`, `markActive(token)`, `markError(token,error)`, `beginExit(reason)`, `finishExit(token)`, `dispose()`, and `snapshot()`. `mount()` is the sole `idle -> mounted` edge. `beginExit()` is valid from `mounted/loading/ready/entering/active/error`, invalidates pending work and enters `exiting`; when already `exiting`, it returns the same exit descriptor/token and continues the same cleanup rather than throwing or starting again. `finishExit()` returns to `mounted`. The composed runtime caches and returns one `exitPromise` for that descriptor. Every mutator verifies the token and transition table. Invalid transitions throw `YUE_E_INVALID_TRANSITION`; stale tokens return `{ stale:true }` without changing state. `dispose()` is valid from `idle` and every other non-disposed phase.

  `waitForStableFrames({ count:3, requestFrame, cancelFrame, isHealthy, signal, timeoutMs:8000 })` resets its count on any unhealthy sample, aborts with `YUE_E_ENTER_ABORTED`, times out with `YUE_E_STABLE_FRAME_TIMEOUT`, and always cancels its pending RAF.

- [ ] Run `node scripts/check-yue-e-runtime-state.mjs`; expected TAP success with six passing subtests and no pending timer/RAF.

- [ ] Commit:

  ```powershell
  git add web/yue-e/core/lifecycle.js web/yue-e/core/stable-frames.js scripts/check-yue-e-runtime-state.mjs
  git diff --cached --check
  git commit -m "feat: add Yue E runtime lifecycle core"
  ```

## Task 6: 提升已批准资产并实现真实三维空音乐区运行时

**Files:**

- Create: `scripts/yue-e/promote-traveler-lookdev.mjs`
- Create: `web/yue-e/core/errors.js`
- Create: `web/yue-e/core/context-recovery.js`
- Create: `web/yue-e/assets/asset-gate.js`
- Create: `web/yue-e/character/lookdev-loader.js`
- Create: `web/yue-e/world/phase-1-collision.js`
- Create: `web/yue-e/music-zone/anchors.js`
- Create: `web/yue-e/scene/shell-scene.js`
- Create: `web/yue-e/runtime.js`
- Create: `scripts/check-yue-e-promotion.mjs`
- Create: `scripts/check-yue-e-asset-gate.mjs`
- Create: `scripts/check-yue-e-shell-scene.mjs`
- Create: `scripts/check-yue-e-runtime-shell.mjs`
- Create: `scripts/check-yue-e-shell-modules.mjs`
- Generate: content-addressed `web/assets/yue-e/character/yue-e-traveler-lookdev.<12-uppercase-hex>.glb`
- Generate: `web/assets/yue-e/character/yue-e-traveler-lookdev.manifest.json`

**Interfaces:**

- `promoteTravelerLookdev({root,gate,candidate,contract,outDirectory,outManifest,faultInjector}) -> PromotionReport` accepts only verified root-contained relative paths, installs a byte-identical immutable content-addressed GLB, and atomically replaces the manifest as the single commit point; the no-argument CLI is a thin wrapper over repository defaults.
- `loadApprovedTraveler(options) -> Promise<TravelerHandle>`; after rejecting any non-empty animation array, the handle owns only traveler resources and exposes `scene`, `report`, `assetSha256`, `dispose()`.
- `createPhase1Collision(travelerReport) -> CollisionReadiness`; `createMusicZoneAnchors(three) -> AnchorRegistry`.
- `createShellScene(options) -> {renderFrame,readiness,setInputEnabled,rebuildRenderer,diagnostics,dispose}`; it never schedules RAF or owns traveler disposal.
- `createContextRecovery(options) -> {handleLost,handleRestored,snapshot,dispose}`.
- `createYueERuntime(platform) -> FeYueE`; `FeYueE.mount(domainDependencies)` accepts only the six domain adapters.

The cross-file records are exact and readonly at their boundaries:

```ts
type Vec3 = readonly [number, number, number];
type Bounds3 = Readonly<{ min: Vec3; max: Vec3 }>;
type PoseProbe = Readonly<{ bone: string; passed: boolean; movedVertexCount: number; maxMovedMeters: number; controlMaxMovedMeters: number }>;
type TravelerReport = Readonly<{
  heightMeters: number; triangleCount: number; boneCount: number; wingPanelCount: number;
  bodyBounds: Bounds3; bodyMaxRadialDistance: number; lod0SemanticIds: readonly string[];
  bindPoseMaxResidual: number; exportedPoseProbes: readonly PoseProbe[];
  rigFingerprintSha256: string; approvedLod0FingerprintSha256: string;
}>;
type TravelerHandle = Readonly<{
  scene: object; report: TravelerReport; assetSha256: string; dispose(): void;
}>;
type CollisionReadiness = Readonly<{
  ready: true; kind: "capsule"; radius: number; segmentStart: Vec3; segmentEnd: Vec3;
  visualOverhangMeters: number; source: "approved-body-metrics";
}>;
type MusicAnchorId = "respawn" | "presetGallery" | "playlist" | "functionDock" | "overlay";
type AnchorRegistry = Readonly<{
  version: 1; ids: readonly MusicAnchorId[]; get(id: MusicAnchorId): object;
  readiness(): Readonly<{ anchors: boolean }>; dispose(): void;
}>;
type ShellReadiness = Readonly<{
  terrain: boolean; collision: boolean; character: boolean; anchors: boolean;
  renderer: boolean; frame: boolean; firstFrameSafe: boolean;
}>;
type ShellHandle = Readonly<{
  renderFrame(timeMs: number, dtSeconds: number): void; readiness(): ShellReadiness;
  setInputEnabled(enabled: boolean): void; rebuildRenderer(): Promise<void>;
  diagnostics(): Readonly<Record<string, unknown>>; dispose(): void;
}>;
type RecoveryOptions = Readonly<{
  runtimeId: string; canvas: EventTarget; shell: Pick<ShellHandle, "setInputEnabled" | "rebuildRenderer" | "readiness">;
  now(): number; setTimer(fn: () => void, ms: number): unknown; clearTimer(id: unknown): void;
  waitForStableFrames(): Promise<{ stableFrames: 3 }>;
  collisionReady(): boolean; getLogicalPose(): Readonly<{ logicalPosition: Vec3; logicalRotation: number; movementMode: "ground" }>;
  applyLogicalPose(pose: Readonly<{ logicalPosition: Vec3; logicalRotation: number; movementMode: "ground" }>): void;
  useMusicZoneRespawn(): void; setRecoveryUi(phase: "none" | "lost" | "rebuilding" | "fading-in" | "failed"): void;
  onFailure(error: YueEError): void;
}>;
type RecoveryController = Readonly<{
  handleLost(event: { preventDefault(): void }): Readonly<{ handled: true; capturedAt: number }>;
  handleRestored(): Promise<Readonly<{ recovered: boolean; spawn: "volatile" | "respawn" }>>;
  snapshot(): null | Readonly<{ runtimeId: string; logicalPosition: Vec3; logicalRotation: number; movementMode: "ground"; capturedAt: number }>;
  dispose(): void;
}>;
```

- [ ] **RED 6.1 — 只写提升测试。** `scripts/check-yue-e-promotion.mjs` uses a temporary gate/candidate/contract and requires: pending approval rejected; wrong model/contract/rig/approved-LOD0 fingerprint rejected; and approved exact bytes promoted with the same SHA plus an approval-gate digest. Seed an older content-addressed GLB plus manifest, inject a failure after the new GLB rename but before manifest replacement, and prove the old manifest/old referenced bytes remain unchanged while the unreferenced orphan is harmless. Also inject manifest-rename failure and require the same result. Finally retry successfully and require safe post-commit pruning to leave exactly the manifest-referenced GLB; any non-matching file or directory is untouched. Run it and confirm failure because `promote-traveler-lookdev.mjs` is absent.

- [ ] **GREEN 6.1 — 提升相同的已批准字节。**

  Export `promoteTravelerLookdev(options)` with root-contained path validation and a single-manifest commit protocol. The CLI calls that function with repository defaults. It requires `approval.status === "approved"`, recomputes candidate, anchor, `lookdev-contract.js`, canonical rig fingerprint and complete approved-LOD0 visual fingerprint, and requires all approved values to match. Compute the uppercase model/gate hashes first; write/fsync/close a temporary sibling, then atomically rename it to the immutable filename `` `yue-e-traveler-lookdev.${sha256.slice(0, 12)}.glb` ``. If that file already exists, verify its complete SHA/length/bytes and reuse it without overwriting. Next write/fsync/close the temporary manifest and atomically rename only that file as the commit point. A failure before manifest replacement leaves the previous manifest and its referenced GLB untouched; an unreferenced content-addressed orphan may remain and is reported, never selected by the runtime or packager. After a successful manifest commit, enumerate only direct children of the already-verified character directory, resolve every candidate back under that directory, and delete only files matching `^yue-e-traveler-lookdev\.[A-F0-9]{12}\.glb$` other than the committed basename. If pruning cannot finish, return `committed:true, clean:false`, make the CLI exit non-zero, and forbid staging until a successful cleanup rerun proves exactly one matching GLB remains. Its manifest has typed fields `version:1`, `profile:"phase-1-lookdev"`, `assetUrl` computed exactly as `` `./yue-e-traveler-lookdev.${sha256.slice(0, 12)}.glb` ``, full uppercase `sha256`, identical `approvedModelSha256`, full `approvedGateSha256`, actual `byteLength/heightMeters/triangleCount/boneCount/wingPanelCount/bodyBounds/bodyMaxRadialDistance/lod0SemanticIds/bindPoseMaxResidual/exportedPoseProbes`, full `lookdevContractSha256`, full `rigFingerprintSha256`, full `approvedLod0FingerprintSha256`, and repository-relative `approvedGatePath`. It never uses `approvedAt` in runtime behavior.

  Run `node scripts/check-yue-e-promotion.mjs`, then run `node scripts/yue-e/promote-traveler-lookdev.mjs`; both must pass, and the GLB referenced by the committed manifest must be byte-identical to the approved candidate.

- [ ] **RED 6.2 — 只写资产门测试。** `scripts/check-yue-e-asset-gate.mjs` requires: non-OK HTTP maps to network error before hashing; relative URL resolution/allowlist rejects traversal and encoded slash; SHA is checked before `parse`; lazy loader constructor is awaited; first loader initialization may reject and a retry on the same runtime may resolve; abort/stale checks occur after every async boundary; a malformed hierarchy/origin/rig or non-empty animation array is rejected; a late parse result is disposed; and errors containing `C:\\Users\\secret`, `<script>`, or `powershell -Command` are reduced to safe codes/messages. Run it and confirm missing modules.

- [ ] **GREEN 6.2 — 实现 SHA 优先的资产门。**

  `loadApprovedTraveler({ manifestUrl, fetch, cryptoSubtle, ensureGltfLoader, three, signal, isOperationCurrent })` fetches the manifest and GLB once. Require `response.ok` before reading either body so a 503 maps to `YUE_E_ASSET_NETWORK`, not hash failure. Resolve the relative asset URL against `manifestResponse.url || manifestUrl`, then require same origin, a decoded path under `/assets/yue-e/character/`, the exact content-addressed basename pattern, and reject encoded slash/backslash plus `data:`/`blob:`. Require `manifest.sha256 === manifest.approvedModelSha256` before network parse. Compute uppercase SHA-256 with `crypto.subtle.digest`, check it before parse, then await `const GLTFLoader = await ensureGltfLoader()` and call `new GLTFLoader().parse(arrayBuffer, basePath, onLoad, onError)`. Check `signal.aborted` and `isOperationCurrent()` immediately after manifest fetch, GLB fetch, digest, loader await and parse callback; any stale parsed scene is disposed without reveal. Validate authored full/body bounds, region/LOD/semantic-ID tags and radial distance, exact bones/materials/hierarchy, root identity, floor/origin/forward orientation, SkinnedMesh presence, wing count, bind residual, five exported pose probes, both rig/approved-LOD0 fingerprints and an empty animation array without automatic fit/autoplay; sorted semantic IDs and recomputed body metrics must match the manifest within 0.001m. Return `{ scene, report, assetSha256, dispose }`.

  Map failures to safe `YueEError` codes such as `YUE_E_ASSET_NETWORK`, `YUE_E_ASSET_HASH`, `YUE_E_ASSET_PARSE`, `YUE_E_ASSET_CONTRACT`, `YUE_E_WEBGL_UNAVAILABLE`; UI messages must not contain absolute paths, response bodies or raw stack traces.

  Run `node scripts/check-yue-e-asset-gate.mjs`; all asset/abort/redaction cases must pass before continuing.

- [ ] **RED 6.3 — 只写场景、碰撞和锚点测试。** Import npm `three` with a fake renderer and require: authored neutral ground and lights, exact respawn ring, approved traveler at authored origin/facing, an inert kinematic capsule deterministically derived from the validated semantic body metrics for 1.30m and 1.40m fixtures, and unique music-zone anchors `respawn`, `presetGallery`, `playlist`, `functionDock`, `overlay`. Assert the capsule is finite, centered on the authored body axis, touches floor/top, ignores `wing`/`tool`, and reports any deliberate visual overhang instead of claiming to contain shoe soles, hair or loose clothing. Assert `respawn.y === 0`; only the four future UI anchors must be 6–10m high with finite transforms and downward-facing orientation. Toggle each of terrain/collision/character/anchors/renderer readiness false in turn and require `readiness().firstFrameSafe === false`. Run and confirm the three scene modules are missing.

- [ ] **GREEN 6.3 — 构建清晰、真实 3D 的阶段 1 空音乐区。**

  `createPhase1Collision(travelerReport)` derives a ready inert locomotion proxy from the validated semantic body metrics (wings/tool excluded): use the already verified per-vertex `bodyMaxRadialDistance` directly, never `hypot(maxAbsX,maxAbsZ)` from unrelated extrema; radius is `clamp(bodyMaxRadialDistance + 0.02, 0.24, 0.36)`, segment start Y is radius, and segment end Y is `heightMeters - radius`, so the capsule floor/top are 0 and the approved authored height. Require finite/ordered inputs, the authored body X/Z center within 0.02m of the origin, and `heightMeters > 2 * radius`. Return `visualOverhangMeters = max(0, bodyMaxRadialDistance - radius)` as diagnostics. This is deliberately a stable kinematic approximation—not a claim that the round floor contact fully contains broad shoe soles, hair or loose garment vertices—and therefore must not reject an otherwise approved model solely for that visual overhang. It proves a deterministic character/controller handoff but has no input or movement yet. `createMusicZoneAnchors(three)` creates invisible Object3D transforms: respawn `[0,0,0]`, preset gallery `[-8,8,-12]`, playlist `[8,8,-12]`, function dock `[13,7,-10]`, and overlay `[0,9,-16]`; UI anchors point toward the respawn/user area with approximately 45° downward pitch. No DOM or final panels are mounted in stage 1.

  `createShellScene({ three, canvas, createRenderer, traveler, collision, anchors })` creates an antialiased WebGL renderer, capped DPR, soft shadows, fog, a hemisphere light, a warm directional key, and a cool rim. For r128 set `renderer.outputEncoding = three.sRGBEncoding`; when the npm r185 structural test lacks that API use `renderer.outputColorSpace = three.SRGBColorSpace`. Select ACES tone mapping only when the injected Three exposes it. Add a neutral softly sculpted ivory-stone ground platform, a thick glowing respawn ring labelled internally `MusicZoneRespawn`, and three abstract stone markers; do not build the stage-2 wind-grassland chunk or biome vegetation. Place the approved traveler at authored origin. The fixed audit camera uses FOV 50° and ~3.4m framing but is not the controllable third-person system reserved for stage 2.

  Return exactly `{ renderFrame, readiness, setInputEnabled, rebuildRenderer, diagnostics, dispose }`. Runtime alone owns/schedules RAF and passes real `timeMs/dt` to `renderFrame`; shell code never schedules another frame. `readiness()` has booleans `terrain`, `collision`, `character`, `anchors`, `renderer`, `frame`, and `firstFrameSafe` is true only when all are true. `rebuildRenderer()` replaces only the renderer/context while retaining CPU scene state. The shell ledger owns its terrain/lights/ring/render targets and each renderer instance, but explicitly excludes the externally supplied traveler; runtime disposes shell first and the traveler asset handle second, exactly once each.

  Run `node scripts/check-yue-e-shell-scene.mjs`; all geometry/readiness/resource-ledger cases must pass.

- [ ] **RED 6.4 — 只写组合运行时和 context 恢复测试。** Required tests are: exact six-method public surface; domain-only `mount()` under poisoned `window.state/window.els`; every readiness boolean resets the three-frame counter; core failure preserves base/domain snapshots and retry succeeds; base heavy rendering is suspended before the first yueE renderer frame and resumed on every failure/exit; concurrent/late exit returns one promise and leaves zero owned work; ordinary exit waits for the injected transition but reduced motion resolves without a 520ms timer; visibility/pagehide suspension is immediate; persisted pagehide leaves a reusable mounted runtime while non-persisted disposal is final; `webglcontextlost` calls `preventDefault`, freezes input and captures volatile state; `webglcontextrestored` rebuilds a renderer in the same runtime and fades in after three safe frames; expired/invalid recovery returns to the respawn ring; an injected fake clock/timer proves the exact 8s recovery timeout and leaves no timer; every renderer loses context at most once. Add snapshot tests for v2 round-trip, valid same-runtime volatile restore, normal re-entry respawn, duplicate restore idempotence, and damaged/unknown-version input causing no partial mutation; assert diagnostics and snapshot contain no audio/playlist state. Run and confirm missing runtime/recovery modules.

- [ ] **GREEN 6.4 — 组合公开运行时与恢复子状态。**

  `createYueERuntime(platform)` returns exactly the six public methods. `mount(domainDependencies)` validates only the six domain adapters fixed above. `enter()` resolves `YUE_E_RESOURCE_IDS.travelerManifest` through the mounted provider, shows a lightweight loading/error status while the base surface remains unchanged, and loads/verifies the character, collision and anchors without starting a second heavy renderer. Immediately before constructing the yueE renderer or scheduling its first RAF, call `setBaseRenderSuspended(true,"yue-e-preflight")`; the base DOM/state and its last rendered frame remain visible, but the shared invariant is at most one active heavy world RAF. Build the scene, begin its RAF, and feed the conjunction of all six readiness booleans into the consecutive-frame gate. Unknown, cross-origin or non-`/assets/yue-e/character/` resource results are rejected. After three healthy renders it marks `entering`, calls `setBaseSurfaceObscured(true)`, performs the 520ms overlap, then marks `active`. It resolves:

  ```js
  { ready: true, stableFrames: 3, gateReport }
  ```

  On failure it disposes partial resources, calls `setBaseSurfaceObscured(false)` and `setBaseRenderSuspended(false,"yue-e-failed")`, enters retryable error and leaves every domain snapshot untouched. `exit()` freezes scene input, performs a 520ms fade (or immediate reduced-motion path), cancels stale work, then resumes base rendering and restores base visibility/focus; concurrent exit calls return the same promise. `snapshot()` returns the exact v2 durable/volatile/diagnostics structure above. `restore()` validates the complete input into a temporary normalized record before mutation, accepts only version 2, never restores audio, uses volatile pose only for the same live runtime/age/collision rules, otherwise chooses the music-zone ring, and returns the fixed success/failure descriptor without leaking validation details.

  `createContextRecovery(options)` implements the exact `RecoveryOptions/RecoveryController` shapes above and owns subphases `none/lost/rebuilding/fading-in/failed` without adding illegal main lifecycle edges. On `webglcontextlost`, call `preventDefault()`, freeze input, retain the typed volatile snapshot and show `#yueERecovery`. On restore, call the shell's `rebuildRenderer()` for the same runtime/scene, require collision plus three safe frames, then fade from dense fog to the scene. Restore the logical position only when runtime ID matches and age ≤10s; otherwise use the music-zone respawn ring. Race the rebuild against an 8,000ms timer made only through injected `setTimer/clearTimer/now`; clear it on success, failure, loss replacement and dispose. Timeout or rebuild failure returns to the visible base/error surface without touching playback.

  Every relative module import inside `runtime.js`, `core/`, `assets/`, `character/`, `world/`, `music-zone/` and `scene/` must carry `?v=20260821-yue-e-phase1-1`; the entry contract enumerates and rejects an unversioned import.

- [ ] Run:

  ```powershell
  node scripts/yue-e/promote-traveler-lookdev.mjs
  node scripts/check-yue-e-promotion.mjs
  node scripts/check-yue-e-asset-gate.mjs
  node scripts/check-yue-e-shell-scene.mjs
  node scripts/check-yue-e-runtime-shell.mjs
  node scripts/check-yue-e-shell-modules.mjs
  node --check web/yue-e/runtime.js
  ```

  Confirm promoted GLB SHA exactly matches the user-approved SHA and all shell tests pass.

- [ ] Commit new modules and approved runtime asset:

  ```powershell
  git add scripts/yue-e/promote-traveler-lookdev.mjs web/yue-e/core/errors.js web/yue-e/core/context-recovery.js web/yue-e/assets web/yue-e/character/lookdev-loader.js web/yue-e/world web/yue-e/music-zone web/yue-e/scene web/yue-e/runtime.js web/assets/yue-e/character scripts/check-yue-e-promotion.mjs scripts/check-yue-e-asset-gate.mjs scripts/check-yue-e-shell-scene.mjs scripts/check-yue-e-runtime-shell.mjs scripts/check-yue-e-shell-modules.mjs
  git diff --cached --check
  git commit -m "feat: add approved Yue E runtime shell"
  ```

## Task 7: 接入“场景”按钮、平滑进退和真实浏览器回退

**Files:**

- Create: `web/yue-e/yue-e.css`
- Create: `scripts/check-yue-e-entry-contract.mjs`
- Create: `scripts/check-yue-e-phase-1-browser.mjs`
- Modify: `web/index.html`
- Modify: `web/app.js`

**Interfaces:**

- DOM IDs are fixed as `yueEButton`, `yueERoot`, `yueECanvas`, `yueEStatus`, `yueERecovery`, `yueERetryButton`, `yueEExitButton`.
- App bridge functions are `ensureYueERuntime`, `createYueEPlatform`, `createYueEDomainDependencies`, `createSurfaceTransitionWait`, `captureBaseSurfaceSnapshot`, `requestExclusiveWorldMode`, `isYueERecovering`, `enterYueE`, `exitYueE`, `syncYueEPhase`, `bindYueEEvents`.
- `node scripts/check-yue-e-entry-contract.mjs` is static; `node scripts/check-yue-e-phase-1-browser.mjs` runs four real-browser profiles.

- [ ] **RED — 写入口静态合约。**

  Assert all of the following before changing production HTML:

  - `#yueEButton` is the immediate element sibling after `#sandboxModeButton`, text is `场景`, `aria-controls="yueERoot"`, and `aria-pressed="false"` initially.
- `#yueERoot` is the immediate sibling after the closing `.app-shell`, not its descendant; it starts `hidden`, `data-yue-e-state="idle"`, and contains `#yueECanvas`, live `#yueEStatus`, `#yueERecovery`, `#yueERetryButton` and `#yueEExitButton`. This separation lets the base shell fade without also fading the scene canvas.
  - `yue-e/yue-e.css?v=20260821-yue-e-phase1-1` is loaded after `styles.css` in `web/index.html`.
  - the changed `app.js` entry is bumped from its current token to `app.js?v=20260821-yue-e-phase1-1`; reusing the old `20260821-audio-atomic-6` token is a failure.
  - among imports whose path contains `/yue-e/`, the only app-bridge runtime import is `./yue-e/runtime.js?v=20260821-yue-e-phase1-1` and is single-flight; unrelated existing app imports are out of this assertion.
  - extract only the new yueE bridge function bodies plus files under `web/yue-e/` when checking forbidden APIs; that scoped source contains no remote URL, CDN, bare `three` import, `new Audio(`, or assignment/call against the main audio element's `src/load/play/pause/currentTime`. Do not scan the whole legacy `app.js`, which legitimately contains player code.
  - CSS has a 520ms enter/exit path and a `prefers-reduced-motion` override.
  - `html[data-fe-client="desktop-scene"]` and `html[data-fe-client="desktop-pet"]` hide `.world-mode-entry-actions` and `#yueERoot`, matching the existing special-client surface boundary.
  - `aria-busy` is true only during loading/entering/rebuilding; success, retryable error, cancellation and exit remove it or set it false, and retry remains clickable in error.
  - scoped app lifecycle handlers pass `pagehide.persisted === true` to immediate reusable suspension, dispose/clear refs on non-persisted pagehide and beforeunload, normalize pageshow back to mounted/closed surface, and use an immediate `visibility-hidden` reason; no app handler translates WebGL context loss into `exit()`.

- [ ] Run `node scripts/check-yue-e-entry-contract.mjs`; confirm it fails because the entry/root are absent.

- [ ] **RED — 在生产集成前写完整真实浏览器探针。** Build `scripts/check-yue-e-phase-1-browser.mjs` from the repository's HTTP/Edge/raw-CDP fixture and the audio continuity spy. Its local server also serves a deterministic 30-second PCM WAV and the fixture sets `audio.loop = true` before recording the baseline. Define four clean profiles now—success/continuity, asset-503/retry from an open sandbox, WebGL-unavailable/retry from open DIY, and real `WEBGL_lose_context` loss/restore. Run it before editing HTML/app; all profiles must fail first because `#yueEButton` is absent.

- [ ] **GREEN — 添加不破坏现有按钮的入口簇和运行时壳 DOM。**

  In `web/index.html`, wrap the existing sandbox button and new scene button in `.world-mode-entry-actions`, preserving the existing sandbox node unchanged. Place `#yueERoot` immediately after the closing `.app-shell` and before `#recordingDialog`, as a sibling outside the base surface:

  ```html
  <button id="yueEButton" class="yue-e-entry-button glass-surface" type="button"
          aria-label="进入遇E" aria-controls="yueERoot" aria-pressed="false">
    <span class="glass-surface__content">场景</span>
  </button>

  <section id="yueERoot" class="yue-e-root" data-yue-e-state="idle"
           aria-label="遇E 三维场景" hidden>
    <canvas id="yueECanvas" aria-label="遇E 三维画面"></canvas>
    <div id="yueEStatus" role="status" aria-live="polite"></div>
    <div id="yueERecovery" role="status" aria-live="assertive" hidden>正在恢复遇E画面…</div>
    <button id="yueERetryButton" type="button" hidden>重试</button>
    <button id="yueEExitButton" type="button">退出遇E</button>
  </section>
  ```

  `yue-e.css` overrides the old fixed sandbox positioning through the new flex cluster, covers existing desktop/mobile breakpoints, keeps both buttons large and non-overlapping, and defines loading/error overlays that do not hide the base app. It also hides the cluster/root for `desktop-scene` and `desktop-pet` special clients. The 3D canvas accepts scene pointer input only in `entering/active`; status, retry and exit controls retain `pointer-events:auto` in loading/error/recovery. After the stable-frame gate, canvas opacity and base-surface opacity cross-fade in opposite directions for 520ms; base visibility becomes hidden only after its fade completes. Exit performs the inverse overlap. No grain/noise/dither filter is allowed.

- [ ] **GREEN — 添加薄应用桥。**

  Extend the existing `els` map and `state` with:

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
  }
  ```

  Implement `ensureYueERuntime()`, `createYueEPlatform()`, `createYueEDomainDependencies()`, `createSurfaceTransitionWait()`, `captureBaseSurfaceSnapshot()`, `requestExclusiveWorldMode(mode)`, `isYueERecovering()`, `enterYueE()`, `exitYueE(reason)`, `syncYueEPhase(detail)` and `bindYueEEvents()`. The transition wait listens for the root's opacity transition with an abortable 560ms safety timeout; the platform bypasses it when reduced motion is true. Import the runtime once, create it with the platform seam once, mount the six domain adapters once, and expose that same instance as `window.FeYueE`. The resource resolver maps only `yue-e.traveler.lookdev.manifest` to same-origin `assets/yue-e/character/yue-e-traveler-lookdev.manifest.json?v=20260821-yue-e-phase1-1`; unknown IDs throw `YUE_E_RESOURCE_UNKNOWN`.

  On click, capture a read-only base observation plus return focus, but do not close or mutate sandbox, DIY or playback state during asset preload. Because the base remains operable, never replay an old snapshot over legitimate user changes; on failure/exit remove only yueE-owned classes/ARIA/render suspension and resume whatever base mode is current at that moment. Set `surfaceOpen:true`, root visible, button `aria-busy:true`, and leave `aria-pressed:false` until active. The platform's `setBaseRenderSuspended` toggles only `state.yueE.baseRenderSuspended` and the existing base RAF schedulers; it preserves the last canvas frame and every logical/DOM state. Runtime invokes it immediately before its own renderer/RAF starts, not after the stable-frame gate. On success set `active:true`/`aria-pressed:true` and obscure the base surface without destroying its state. Exit clears both booleans, hides root, resumes the current base renderer and returns focus. The runtime owns and disposes each stale operation result; the bridge only ignores a stale resolution and must not dispose the singleton used by a newer enter.

  The main lifecycle `phase` remains `active` during context recovery; `recoveryPhase` alone takes `none/lost/rebuilding/fading-in/failed`, and `isYueERecovering()` is the only predicate for it. `requestExclusiveWorldMode()` serializes yueE/sandbox/DIY changes. If sandbox or DIY is requested while `surfaceOpen` is true, including any recovery subphase, await the same `exitYueE("mode-switch")` before opening it. If yueE is requested while sandbox/DIY is already open, preserve that logical state and its last rendered frame under the overlay, but suspend its render loop before yueE creates/runs a renderer. Add equivalent guards at the top of existing `setSandboxOpen(true)` and `setDiyOpen(true)` so direct callers cannot create two heavy WebGL modes. Instrument the shared scheduler in tests so `activeHeavyRafCount` never exceeds 1.

  Integrate yueE as the top Escape layer whenever `surfaceOpen` is true, return `yue-e` from `renderClaritySceneKey()` while `active || isYueERecovering()`, skip base orb/sandbox RAF whenever `state.yueE.baseRenderSuspended || active || isYueERecovering()`, and report both phases in the pet context. Guard the existing sandbox keydown handler before its Escape/Delete logic whenever yueE `surfaceOpen` is true, and guard its visibility-resume RAF with the same shared render-suspension predicate; otherwise a preserved open sandbox would close or mutate underneath yueE. Harden `ensureSandboxGltfLoader()` so both script error and load-without-constructor reset the shared promise/remove the failed script; a second attempt must be possible for sandbox and yueE.

  Lifecycle reasons have exact timing: normal button/Escape/navigation uses the 520ms exit; `visibility-hidden` and `pagehide` with `event.persisted === true` perform immediate input/RAF/resource suspension and return to mounted without waiting for throttled timers; `pageshow` clears stale surface flags and leaves that same runtime reusable at the respawn ring; `beforeunload` and non-persisted `pagehide` call synchronous idempotent `dispose()` and clear bridge runtime/promise references. WebGL context events stay inside runtime recovery and must not be converted into app-level exit. Never modify `state.playbackPage`, current song, queue, audio element or source.

- [ ] Run the entry contract and syntax checks:

  ```powershell
  node scripts/check-yue-e-entry-contract.mjs
  node --check web/app.js
  node --check web/yue-e/runtime.js
  ```

- [ ] **GREEN — 让四个浏览器纵切面全部通过。** Launch Edge with the repository fixture's profile isolation plus `--autoplay-policy=no-user-gesture-required --use-angle=d3d11 --enable-webgl --ignore-gpu-blocklist`; record the actual GL vendor/renderer and fail with an explicit environment result if the required hardware path is unavailable. Set `#audio` to the local looping WAV, start it once, wait until `currentTime > 0.15`, then record method/property baselines and never call `play()` again. Each profile must prove the loop-aware media clock advances through preload, active, failure/retry, context recovery and exit; `paused` stays false; `src/currentSrc/loop/volume/muted/playbackRate`, song ID and queue revision remain unchanged; and scene operations add zero calls/writes beyond the setup baseline.

  1. **Success/continuity:** first delay the GLB, click yueE, then click sandbox mid-preload and prove the yueE operation cancels before sandbox opens with no late activation; close sandbox and enter yueE normally. While active, programmatically request DIY and prove the coordinator exits yueE before DIY opens with no overlapping heavy renderer; close DIY and enter again. Sample both surface opacities throughout the 520ms transition (no sample where their sum falls below 0.95), require active/non-uniform 3D canvas and three safe frames, repeat enter/exit, dispatch persisted `pagehide`/`pageshow` and prove immediate zero-RAF reusable mount, then restore focus.
  2. **Asset 503/retry:** open sandbox first, fail the first GLB request, require the exact sandbox DOM/ARIA/focus state still present, restore route, retry in the same runtime, exit and recover that same sandbox state.
  3. **WebGL unavailable/retry:** open DIY first, monkeypatch `getContext` only for `#yueECanvas`, require safe error and unchanged DIY/playback, restore WebGL and retry without a second runtime.
  4. **Context loss/restore:** enter, invoke `WEBGL_lose_context.loseContext()`, require `preventDefault`, frozen input, visible recovery layer and same runtime ID; press Delete and prove no preserved sandbox state mutates. Call `restoreContext()`, require a new renderer, collision ready, three safe frames and fog fade back without exiting the scene. Trigger a second loss, request sandbox, and prove the coordinator completes yueE cleanup before sandbox opens—never two heavy renderers at once.

  All profiles sample the instrumented `activeHeavyRafCount` from click through teardown and require it never exceeds 1, including the three-frame preflight and retry cases. They also require zero console/page exceptions and no stale `aria-busy` in active/error/exited states. After final teardown assert zero owned RAF/listeners/ResizeObserver, `loseContextCalls === rendererCount` with each renderer instance at most once, hidden root and exact base restoration. Save:

  ```text
  artifacts/yue-e/phase-1/runtime-shell.png
  artifacts/yue-e/phase-1/error-fallback.png
  artifacts/yue-e/phase-1/webgl-unavailable.png
  artifacts/yue-e/phase-1/context-recovery.png
  ```

- [ ] Run `node scripts/check-yue-e-phase-1-browser.mjs`; expected JSON has `ok:true` plus explicit success, asset-failure, WebGL-unavailable and context-recovery profile objects, audio-clock samples and resource-instance reports.

- [ ] Review and partially stage only遇E hunks from the already-dirty shared files:

  ```powershell
  git add web/yue-e/yue-e.css scripts/check-yue-e-entry-contract.mjs scripts/check-yue-e-phase-1-browser.mjs
  git add -p -- web/index.html web/app.js
  git diff --cached --check
  git diff --cached -- web/index.html web/app.js
  git commit -m "feat: integrate Yue E scene entry safely"
  ```

## Task 8: 锁定缓存/安装边界、跑回归并执行阶段 1 验收

**Files:**

- Create: `scripts/check-yue-e-phase-1-contract.mjs`
- Modify: `web/cache-fingerprints.json`
- Modify: `scripts/check-web-cache-fingerprints.mjs`
- Modify: `scripts/build-installer.ps1`
- Modify: `scripts/install-fe-monster.ps1`
- Modify: `scripts/check-windows-installer-contract.ps1`
- Modify: `scripts/check-final-installer-isolated-install.ps1`

**Interfaces:**

- `check-yue-e-phase-1-contract.mjs` is the non-browser aggregate and release-file/cache assertion.
- `collectReferences()` must discover HTML, dynamic JS and static ESM references through the existing `resolveLocalReference()` contract.
- Installer checks accept their existing `-Root/-PayloadRoot/-SetupExe/-TestRoot/-ExpectedCacheToken` parameters; no new broad installer API is introduced.

- [ ] **RED — 写阶段 1 发布聚合检查。**

  `check-yue-e-phase-1-contract.mjs` spawns the non-browser phase checks and treats the approved Gate A file as the trust root. It requires `approval.status === "approved"`, `approval.approvedModelSha256 === gate.model.sha256`, then requires runtime manifest `sha256 === approvedModelSha256 === gate.model.sha256`, `approvedGateSha256` equal the current approved gate bytes, and exact equality of manifest/gate contract, rig and approved-LOD0 visual fingerprints. Hash the manifest-selected GLB bytes again and require the same SHA. The source character directory must contain exactly one filename matching the content-addressed lookdev pattern and it must be that selected file. The checker also asserts all production files exist, `app.js` uses the new phase token, and every versioned yueE ESM dependency appears in `web/cache-fingerprints.json`. It requires the following files in every Windows payload/critical-file list:

  ```text
  web\yue-e\package.json
  web\yue-e\runtime.js
  web\yue-e\yue-e.css
  web\yue-e\core\lifecycle.js
  web\yue-e\core\stable-frames.js
  web\yue-e\core\errors.js
  web\yue-e\core\context-recovery.js
  web\yue-e\assets\asset-gate.js
  web\yue-e\character\lookdev-contract.js
  web\yue-e\character\lookdev-loader.js
  web\yue-e\world\phase-1-collision.js
  web\yue-e\music-zone\anchors.js
  web\yue-e\scene\shell-scene.js
  web\assets\yue-e\character\yue-e-traveler-lookdev.manifest.json
  ```

  In addition to the static list, the checker/build reads that already gate-verified manifest, validates its basename against `^yue-e-traveler-lookdev\.[A-F0-9]{12}\.glb$`, resolves it within the same character directory, and requires exactly that manifest-referenced GLB in the payload/critical set. It must not package unreferenced content-addressed GLBs.

- [ ] Run `node scripts/check-yue-e-phase-1-contract.mjs`; confirm it fails on missing static-import cache discovery and installer/cache declarations.

- [ ] **GREEN — 更新发布边界。**

  Add the listed static files to `$requiredPayloadItems` in `scripts/build-installer.ps1`, `Assert-RequiredFiles` in `scripts/install-fe-monster.ps1`, the dedicated `$yueERuntimeFiles` assertion in `scripts/check-windows-installer-contract.ps1`, and `$criticalRelativeFiles` in `scripts/check-final-installer-isolated-install.ps1`. In each build/check path, read the repository's approved Gate A as the expected identity, validate the source manifest lineage above, and add only its content-addressed GLB to the corresponding payload/critical set. Staged and isolated-install checks compare their manifest's model/gate/contract/rig/approved-LOD0 hashes with those trusted source values, then rehash installed GLB bytes. Extend the existing embedded-GLB validation so that selected traveler GLB is checked for self-contained images/buffers and exact manifest hash; fail if another unreferenced `yue-e-traveler-lookdev.*.glb` exists in the source character directory or enters the staged payload. Because Stage-Payload recursively copies `scripts/`, explicitly remove `scripts\yue-e\` after staging; assert that Blender builders, approver/promoter and all `check-yue-e-*`/docs/lookdev candidates are absent from staged and isolated-installed payloads.

  Extend the existing `collectReferences()` scanner in `scripts/check-web-cache-fingerprints.mjs` with static ESM discovery for all of these forms, in addition to its current dynamic patterns:

  ```js
  import "./side-effect.js?v=20260821-yue-e-phase1-1";
  import value from "./module.js?v=20260821-yue-e-phase1-1";
  import { value } from "./module.js?v=20260821-yue-e-phase1-1";
  export { value } from "./module.js?v=20260821-yue-e-phase1-1";
  export * from "./module.js?v=20260821-yue-e-phase1-1";
  ```

  Resolve each match through the existing `resolveLocalReference()` and pending-JavaScript queue, deduplicate it, and keep rejecting missing/reused version keys. The phase contract must enumerate all yueE module paths expected in the manifest so a regex that merely exists but misses modules cannot pass.

  Regenerate cache fingerprints only after all `?v=20260821-yue-e-phase1-1` imports/styles are final:

  ```powershell
  node scripts/check-web-cache-fingerprints.mjs --write
  node scripts/check-web-cache-fingerprints.mjs
  ```

  Bump `web/index.html`'s `app.js` query to `20260821-yue-e-phase1-1` before `--write`; do not reuse the previous token after changing `app.js`.

- [ ] Run the complete phase 1 suite from a clean app process:

  ```powershell
  node scripts/check-yue-e-lookdev-contract.mjs
  node scripts/check-yue-e-character-scene.mjs
  node scripts/check-yue-e-glb-parser.mjs
  node scripts/check-yue-e-character-asset.mjs --stage=lookdev
  node scripts/check-yue-e-lookdev-browser.mjs
  node scripts/check-yue-e-approval-gate.mjs
  node scripts/check-yue-e-runtime-state.mjs
  node scripts/check-yue-e-promotion.mjs
  node scripts/check-yue-e-asset-gate.mjs
  node scripts/check-yue-e-shell-scene.mjs
  node scripts/check-yue-e-runtime-shell.mjs
  node scripts/check-yue-e-shell-modules.mjs
  node scripts/check-yue-e-entry-contract.mjs
  node scripts/check-yue-e-phase-1-contract.mjs
  node scripts/check-yue-e-phase-1-browser.mjs
  node --check web/app.js
  node --check web/yue-e/runtime.js
  node scripts/check-web-cache-fingerprints.mjs
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -StageOnly -WebView2Mode Online -AllowEmbeddedPayload
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check-windows-installer-contract.ps1 -PayloadRoot "out\installer\work\payload\FE Monster" -WebView2Mode Online
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -SkipBuild -OutputDir "artifacts\yue-e\phase-1\installer" -WebView2Mode Online -AllowEmbeddedPayload
  $phase1Version = [string](Get-Content -Raw -LiteralPath package.json | ConvertFrom-Json).version
  $phase1Stamp = [DateTime]::UtcNow.ToString("yyyyMMddHHmmss")
  $phase1Setup = Join-Path (Resolve-Path "artifacts\yue-e\phase-1\installer").Path "FE-Monster-Setup-$phase1Version.exe"
  $phase1TestRoot = Join-Path (Resolve-Path ".").Path ".tmp\yue-e-phase1-isolated-install-$phase1Stamp"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check-final-installer-isolated-install.ps1 -SetupExe $phase1Setup -TestRoot $phase1TestRoot -ExpectedCacheToken "20260821-yue-e-phase1-1"
  node scripts/check-main-boot-ready-browser.mjs
  node scripts/check-audio-playback-continuity.mjs
  node scripts/check-app-exit-lifecycle.mjs
  node scripts/check-android-local-runtime.mjs
  node scripts/check-macos-port.mjs
  ```

  Every command must exit 0. If an unrelated pre-existing dirty-worktree regression fails, capture the exact command/output, prove whether the failure reproduces without遇E hunks, and do not misreport it as passed.

- [ ] Inspect `git diff --check`, search all phase files for unfinished markers, and require no matches:

  ```powershell
  rg -n "T[B]D|T[O]DO|F[I]XME|X[X]X|待[定]|占位[符]|implement l[a]ter|类似 T[a]sk" web/yue-e scripts/yue-e docs/superpowers/assets/yue-e/lookdev
  rg -n "T[B]D|T[O]DO|F[I]XME|X[X]X|待[定]|占位[符]|implement l[a]ter|类似 T[a]sk" scripts -g "check-yue-e-*"
  ```

- [ ] Partially stage only phase 1 release hunks from pre-dirty files and commit:

  ```powershell
  git add scripts/check-yue-e-phase-1-contract.mjs
  git add -p -- web/cache-fingerprints.json scripts/check-web-cache-fingerprints.mjs scripts/build-installer.ps1 scripts/install-fe-monster.ps1 scripts/check-windows-installer-contract.ps1 scripts/check-final-installer-isolated-install.ps1
  git diff --cached --check
  git diff --cached
  git commit -m "build: package Yue E phase one runtime"
  ```

- [ ] **USER GATE B — STOP.** Show the user `runtime-shell.png`, `error-fallback.png`, `webgl-unavailable.png` and `context-recovery.png`, plus a concise report containing approved model SHA, GLB metrics, Three r128 render result, stable-frame readiness components, continuous media-clock samples, method-spy counts, per-renderer resource counts and all regression results. Ask for phase 1 acceptance. Do not create or execute the phase 2 plan until the user explicitly accepts this stage.

## Phase 1 Definition of Done

- The user explicitly approved the r128 360° character turntable and that exact approved SHA is the only character asset promoted into `web/`.
- The model is a real, lit, shadow-casting, rigged and skinned 3D character matching the approved silhouette and material contract; it is not a 2D image and contains no full unapproved animation set.
- “场景” appears immediately beside “沙盒模式”; entry never interrupts or restarts the current song.
- The empty local music-zone shell is visibly three-dimensional and fades in only after terrain, inert collision, approved character, anchor registry, renderer and frame health remain ready for three consecutive frames.
- Network/parse/hash/WebGL failures leave the base app visible and playback untouched, offer retry, and recover without duplicate runtime instances.
- WebGL context loss freezes safely and rebuilds/fades in within the same runtime; ordinary exit, repeated enter/exit and page lifecycle paths release their owned resources and restore focus/UI.
- Cache fingerprints, staged/isolated Windows installer, Android local-runtime, macOS port and existing boot/audio/exit regressions pass; build-only Blender/approval tools are absent from payloads.
- The user receives visual proof and explicitly accepts phase 1 before any stage 2 work begins.
