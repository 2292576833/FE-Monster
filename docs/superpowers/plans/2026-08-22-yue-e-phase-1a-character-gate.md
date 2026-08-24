# 遇E Phase 1A 角色外观/骨骼闸门 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生成并验证一个原创、真实三维、真实骨骼蒙皮、无完整动作集的遇E旅人 lookdev GLB，交付 Three.js r128 交互转台，并在 USER GATE A 明确批准前停止。

**Architecture:** Blender 5.1.2 的固定构建脚本生成米制源场景、评审文档和自包含 GLB；Node 原始 GLB 解析器在不依赖 Three.js 的情况下验证容器、坐标、骨架、bind pose、导出后 CPU 变形与两类批准指纹。真实 Edge/Three.js r128 转台再验证浏览器实际蒙皮和视觉输出，批准记录器只在模型、合约、三张锚点、rig fingerprint 与完整 LOD0 visual fingerprint 全部匹配时写入批准字段。

**Tech Stack:** Blender 5.1.2 build `ec6e62d40fa9`、Blender Python (`bpy`)、Node.js 24 ESM/`node:assert`、glTF 2.0 GLB、vendored Three.js/GLTFLoader r128、Microsoft Edge headless + raw CDP。

**Spec:** `docs/superpowers/specs/2026-08-21-yue-e-open-world-scene-design.md`

**Umbrella plan:** `docs/superpowers/plans/2026-08-21-yue-e-phase-1-character-runtime-shell.md` Tasks 1–4。本文是 Phase 1A 的可执行细化；发生冲突时先停下并修订计划，不能静默改写总计划。

## Global Constraints

- 本计划只覆盖 Phase 1A Tasks 1–4 和 USER GATE A。不得创建 `web/assets/yue-e/`，不得添加“场景”按钮，不得开始运行时壳或动作制作。
- 三张 PNG 只是批准的视觉概念锚点，不是可解包、描摹或转换的模型来源。角色、网格、贴图、骨骼和动画必须原创；不得导入、解包或复制《光·遇》的受保护资产。
- 三张锚点必须保持原字节、尺寸和 SHA-256：
  - `e-traveler-approved.png`: 1536×1024, `FE9724E075730551AC657D93C81D3FFFA878C7E0A1D65F454FF890901D3F6F6D`
  - `e-traveler-actions-approved.png`: 1774×887, `468E922942179B00659F5B16CAF7361D059B7CB6E2ACEEC947867F93DB4EEB55`
  - `camera-views-approved.png`: 1817×866, `1429B87737E92FFFAABA44577AF3579556B558F488A2A88787D20F7653312FBF`
- Blender 可执行文件按 `FE_BLENDER_EXE`、`E:\\New Folder\\blender.exe`、标准 Program Files 候选顺序发现，但版本必须精确为 `5.1.2`，build hash 必须精确为 `ec6e62d40fa9`。
- lookdev 使用米制；导出坐标 `+Y` 向上、角色前方 `-Z`、双脚中点为 X/Z 原点；目标高 1.35m，允许 1.30–1.40m；LOD0 为 35,000–60,000 三角形。
- 模型必须是真实体积网格、真实 Armature/SkinnedMesh、真实局部权重和可响应灯光/阴影的材质；二维图片、billboard、平面替身、dummy skin 或所有顶点集中到 Root 均失败。
- lookdev 只含 LOD0，所有可见 mesh node 必须有 `extras.yueELod === 0`、唯一 `extras.yueESemanticId`（前缀 `yue-e.lod0.`）和 `extras.yueERegion`（`body|wing|tool`）。
- GLB 的 `animations` 必须为空；不启用 DRACO、Meshopt、KTX2、transmission 或 `KHR_materials_emissive_strength`。所有 buffer/image 必须内嵌，图片最长边不超过 2048px。
- 浏览器兼容闸门只使用 `web/vendor/three.r128.min.js` 与 `web/vendor/GLTFLoader.r128.js`；不得换成 npm Three、CDN 或图片替身。
- 用户批准前，候选资产只存在于 `blender-source/yue-e/character/`、`docs/superpowers/assets/yue-e/lookdev/` 和 `artifacts/yue-e/phase-1/`。
- 当前工作树已有用户改动。每次提交前先检查 `git status --short`；只暂存本任务新文件/生成物；不得改写或暂存总计划及无关文件。
- 手工文件编辑使用 `apply_patch`。`.blend`、`.glb`、PNG 与 JSON 报告由构建/浏览器脚本生成。

---

## File Map

| Path | Action | Single responsibility |
| --- | --- | --- |
| `web/yue-e/package.json` | Create | 将 `web/yue-e/` 固定为浏览器/Node 共用 ESM 边界。 |
| `web/yue-e/character/lookdev-contract.js` | Create | 唯一机器可读的外观、材质、骨骼、锚点、pose probe 与路径合约。 |
| `scripts/check-yue-e-lookdev-contract.mjs` | Create | 独立验证锚点字节/尺寸和共享合约。 |
| `scripts/yue-e/build-traveler-lookdev.mjs` | Create | 发现并锁定 Blender，转发 `probe/check/build`，清洗输出。 |
| `scripts/yue-e/blender/yue_e_contract.py` | Create | Blender 侧 immutable part/bone/material/export 常量。 |
| `scripts/yue-e/blender/yue_e_geometry.py` | Create | 原创建体积网格、材质和 LOD0 semantic extras。 |
| `scripts/yue-e/blender/yue_e_rig.py` | Create | 创建 39 骨 Armature、权重和 Blender 源 pose probes。 |
| `scripts/yue-e/blender/yue_e_artifacts.py` | Create | glTF 坐标 metrics、比例板、`.blend`、GLB 和报告输出。 |
| `scripts/yue-e/blender/build_traveler_lookdev.py` | Create | Blender CLI orchestration；只在 normal build 写产物。 |
| `scripts/check-yue-e-character-scene.mjs` | Create | 逐 case 验证 probe、geometry、rig 和 artifacts。 |
| `blender-source/yue-e/character/yue-e-traveler-lookdev.blend` | Generate | 可继续制作阶段 2/3 动作的原创源场景。 |
| `docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-lookdev.glb` | Generate | Gate A 唯一候选 GLB。 |
| `docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-material-palette.json` | Generate | 精确材质值与 swatch 清单。 |
| `docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-skeleton.md` | Generate | 39 骨名称、父级、bind 数据与 probe 结果。 |
| `docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-proportion-board.png` | Generate | 3200×1800 正/侧/背/俯视比例板。 |
| `docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-build-report.json` | Generate | 无绝对路径的确定性 build/geometry/rig 报告。 |
| `scripts/yue-e/lib/glb-v2.mjs` | Create | 严格读取 GLB v2 container 与 accessor。 |
| `scripts/yue-e/lib/yue-e-lookdev-gate.mjs` | Create | 语义验证、CPU skin probe、rig/visual fingerprints 与 gate 验证。 |
| `scripts/check-yue-e-glb-parser.mjs` | Create | 合成 container/accessor 夹具。 |
| `scripts/check-yue-e-character-asset.mjs` | Create | 验证真实候选并可写 pending gate。 |
| `docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json` | Generate | 锁定 model/anchor/contract/build/rig/visual 指纹与批准状态。 |
| `docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.html` | Create | r128 评审页结构。 |
| `docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.css` | Create | 中性转台、参考 rail、诊断控件和响应式布局。 |
| `docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.js` | Create | hash-first GLB 加载、真实 r128 pose probes、turntable facade。 |
| `scripts/yue-e/lib/edge-cdp.mjs` | Create | 局部 HTTP、隔离 Edge profile 和 raw-CDP 最小测试夹具。 |
| `scripts/check-yue-e-lookdev-browser.mjs` | Create | 八角度 r128/browser/像素/网络/控制台验证；支持 `--serve`。 |
| `scripts/check-yue-e-approval-gate.mjs` | Create | 临时目录中的批准、wrong-hash 与 tamper 检查。 |
| `scripts/yue-e/approve-traveler-lookdev.mjs` | Create | 只重写三个批准字段的受约束 CLI。 |
| `artifacts/yue-e/phase-1/lookdev-{000..315}.png` | Generate | Gate A 的八张自动化转台证据。 |

## Fixed Types and Interfaces

```ts
type Sha256 = string; // uppercase /^[A-F0-9]{64}$/
type Vec3 = readonly [number, number, number];
type Mat4 = readonly number[]; // exactly 16 finite column-major values
type Region = "body" | "wing" | "tool";

interface PoseProbeSpec {
  bone: "LowerArm_L" | "Shin_R" | "Wing03_L" | "Wing05_R" | "ToolRoot_R";
  controlBone: string;
  axis: Vec3;
  angleDegrees: 12;
  minimumMovedMeters: 0.002;
  maximumControlDriftMeters: 0.0005;
}

interface PoseProbeResult {
  bone: PoseProbeSpec["bone"];
  movedVertexCount: number;
  maximumMovedMeters: number;
  controlVertexCount: number;
  maximumControlDriftMeters: number;
  maskDeltaPixels?: number;
  passed: boolean;
}

interface BuildReport {
  ok: true;
  stage: "lookdev";
  blenderVersion: "5.1.2";
  blenderBuildHash: "ec6e62d40fa9";
  triangles: number;
  heightMeters: number;
  bodyBounds: { min: Vec3; max: Vec3 };
  bodyMaxRadialDistance: number;
  feetMidpointDistanceFromOrigin: number;
  forwardMarkerAxis: "-Z";
  materialNames: string[];
  boneNames: string[];
  boneParents: Record<string, string | null>;
  lod0SemanticIds: string[];
  wingPanelCount: 12;
  trueVolumePartCount: number;
  armatureCount: 1;
  visibleSkinnedMeshCount: number;
  unweightedVertexCount: 0;
  maxInfluencesPerVertex: number;
  maximumBoneOwnership: number;
  sourcePoseProbes: PoseProbeResult[];
  sourceSha256: Sha256;
  outputSha256: Sha256 | null;
}

interface GateReport extends BuildReport {
  bones: string[];
  skinCount: number;
  bindPoseMaxResidual: number;
  exportedPoseProbes: PoseProbeResult[];
  rigFingerprintSha256: Sha256;
  approvedLod0VisualFingerprintSha256: Sha256;
  externalUriCount: 0;
  animations: [];
}

interface GateMetrics {
  bodyBounds: { min: Vec3; max: Vec3 };
  bodyMaxRadialDistance: number;
  feetMidpointDistanceFromOrigin: number;
  forwardMarkerAxis: "-Z";
  lod0SemanticIds: string[];
  bindPoseMaxResidual: number;
  exportedPoseProbes: PoseProbeResult[];
  triangles: number;
  heightMeters: number;
  boneCount: 39;
  wingJointCount: 12;
  materialNames: string[];
}

interface LookdevGateV1 {
  version: 1;
  stage: "lookdev";
  anchors: ReadonlyArray<{ path: string; width: number; height: number; sha256: Sha256 }>;
  lookdevContractSha256: Sha256;
  buildReportSha256: Sha256;
  rigFingerprintSha256: Sha256;
  approvedLod0VisualFingerprintSha256: Sha256;
  model: { path: string; sha256: Sha256; metrics: GateMetrics };
  build: { blenderVersion: "5.1.2"; blenderBuildHash: "ec6e62d40fa9" };
  approval: {
    status: "pending" | "approved";
    approvedModelSha256: Sha256 | null;
    approvedAt: string | null;
  };
  generatedAt: string;
}

interface ReviewSnapshot {
  ready: boolean;
  disposed: boolean;
  contextLost: boolean;
  rendererRevision: "128";
  assetSha256: Sha256 | null;
  authoredBounds: { min: Vec3; max: Vec3 } | null;
  authoredHeightMeters: number | null;
  skinnedMeshCount: number;
  boneNames: string[];
  materialNames: string[];
  semanticIds: string[];
  wingPanelCount: number;
  animationNames: string[];
  poseProbeResults: PoseProbeResult[];
  modelCoverage: number | null;
  activeAngle: number;
  referenceAnchors: ReadonlyArray<{ path: string; width: number; height: number; sha256: Sha256 }>;
  errors: string[];
}
```

Exact callable surfaces:

```ts
// Task 2
probeBlender(executable: string): { version: string; buildHash: string };
runBlenderBuild(options: { stage: "lookdev"; checkOnly: boolean }): BuildReport;

// Task 3
readGlbV2(buffer: Buffer): { magic: "glTF"; version: 2; declaredLength: number; byteLength: number; json: object; bin: Buffer; chunks: object[] };
readAccessor(document: object, bin: Buffer, accessorIndex: number): { meta: object; values: number[][] };
validateYueELookdev(document: object, bin: Buffer, contract: object, buildReport: BuildReport): GateReport;
canonicalRigFingerprint(report: GateReport): Sha256;
canonicalApprovedLod0VisualFingerprint(document: object, bin: Buffer, report: GateReport): Sha256;
verifyLookdevGate(options: { root: string; gate: string; candidate: string; contract: string; requireStatus: "pending" | "approved" }): Promise<{ gate: LookdevGateV1; report: GateReport }>;

// Task 4
window.__yueELookdevReview.setAngle(degrees: number): void;
window.__yueELookdevReview.sampleFrame(): Promise<{ alphaCoverage: number; luminanceVariance: number; modelCoverage: number }>;
window.__yueELookdevReview.snapshot(): Readonly<ReviewSnapshot>;
window.__yueELookdevReview.dispose(): void;
approveTravelerLookdev(options: { root: string; gate: string; candidate: string; contract: string; modelSha256: Sha256; approvedBy: "user"; now?: () => string }): Promise<LookdevGateV1>;
```

---

## Task 1: Lock the executable lookdev contract

**Files:**

- Create: `web/yue-e/package.json`
- Create: `web/yue-e/character/lookdev-contract.js`
- Create: `scripts/check-yue-e-lookdev-contract.mjs`
- Read only: the three approved PNG anchors

**Interfaces:**

- Produces all fixed exports used verbatim by Tasks 2–4.
- The checker takes no arguments, exits non-zero on any mismatch, and emits one final JSON line on success.

- [ ] **Step 1.1: Record the clean scope before creating files**

Run:

```powershell
git status --short
Test-Path -LiteralPath web/yue-e/character/lookdev-contract.js
```

Expected: existing user changes remain visible; the second command prints `False`.

- [ ] **Step 1.2: Write the failing anchor/contract checker**

Create `scripts/check-yue-e-lookdev-contract.mjs` with this complete content:

```js
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const anchors = [
  ["docs/superpowers/assets/yue-e/e-traveler-approved.png", 1536, 1024, "FE9724E075730551AC657D93C81D3FFFA878C7E0A1D65F454FF890901D3F6F6D"],
  ["docs/superpowers/assets/yue-e/e-traveler-actions-approved.png", 1774, 887, "468E922942179B00659F5B16CAF7361D059B7CB6E2ACEEC947867F93DB4EEB55"],
  ["docs/superpowers/assets/yue-e/camera-views-approved.png", 1817, 866, "1429B87737E92FFFAABA44577AF3579556B558F488A2A88787D20F7653312FBF"]
];

for (const [relative, width, height, expectedHash] of anchors) {
  const bytes = await readFile(path.join(root, relative));
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(bytes.readUInt32BE(16), width);
  assert.equal(bytes.readUInt32BE(20), height);
  assert.equal(createHash("sha256").update(bytes).digest("hex").toUpperCase(), expectedHash);
}

const contract = await import("../web/yue-e/character/lookdev-contract.js");
assert.equal(contract.YUE_E_LOOKDEV.approvedLod, 0);
assert.equal(contract.YUE_E_LOOKDEV.semanticIdPrefix, "yue-e.lod0.");
assert.deepEqual(contract.YUE_E_LOOKDEV.allowedHeightMeters, [1.30, 1.40]);
assert.deepEqual(contract.YUE_E_LOOKDEV.requiredAnimationClips, []);
assert.equal(contract.REQUIRED_BONES.length, 39);
assert.equal(new Set(contract.REQUIRED_BONES).size, 39);
assert.deepEqual(Object.keys(contract.REQUIRED_BONE_PARENTS).sort(), [...contract.REQUIRED_BONES].sort());
assert.equal(contract.REQUIRED_BONE_PARENTS.ToolRoot_R, "Hand_R");
assert.equal(contract.REQUIRED_BONE_PARENTS.Wing06_L, "WingRoot_L");
assert.equal(contract.REQUIRED_MATERIALS.length, 10);
assert.equal(contract.APPROVED_ANCHORS.length, 3);
assert.equal(contract.POSE_PROBES.length, 5);
assert.equal(contract.YUE_E_RESOURCE_IDS.travelerManifest, "yue-e.traveler.lookdev.manifest");
assert.equal(contract.LOOKDEV_CANDIDATE_PATH, "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-lookdev.glb");
assert.equal(Object.isFrozen(contract.YUE_E_LOOKDEV.materials.YE_Wing_Glass), true);

console.log(JSON.stringify({ ok: true, anchorCount: 3, boneCount: 39, materialCount: 10, poseProbeCount: 5 }));
```

- [ ] **Step 1.3: Run the checker and observe the intended RED state**

Run:

```powershell
node scripts/check-yue-e-lookdev-contract.mjs
```

Expected: exit non-zero with `ERR_MODULE_NOT_FOUND` naming `web/yue-e/character/lookdev-contract.js`.

- [ ] **Step 1.4: Create the ESM package boundary**

Create `web/yue-e/package.json`:

```json
{ "type": "module" }
```

- [ ] **Step 1.5: Create the fixed material, anchor and pose contract**

Start `web/yue-e/character/lookdev-contract.js` with:

```js
const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
};

export const YUE_E_LOOKDEV = deepFreeze({
  version: 1,
  stage: "lookdev",
  units: "meters",
  upAxis: "+Y",
  forwardAxis: "-Z",
  approvedLod: 0,
  semanticIdPrefix: "yue-e.lod0.",
  targetHeightMeters: 1.35,
  allowedHeightMeters: [1.30, 1.40],
  headRatio: 4.5,
  triangleRange: [35_000, 60_000],
  maxBones: 96,
  maxInfluencesPerVertex: 4,
  wingPanelCount: 12,
  requiredAnimationClips: [],
  materials: {
    YE_Visor: { base: "#081426", roughness: 0.34, metalness: 0.04 },
    YE_Hair: { base: "#F3F1E8", roughness: 0.62, metalness: 0, emissive: "#171713", emissiveStrength: 0.06 },
    YE_Tunic_Ivory: { base: "#F1E6CF", roughness: 0.76, metalness: 0 },
    YE_Coral_Trim: { base: "#E88768", roughness: 0.70, metalness: 0 },
    YE_Shorts: { base: "#172642", roughness: 0.82, metalness: 0 },
    YE_Boots: { base: "#E8DDC8", roughness: 0.78, metalness: 0 },
    YE_Chest_Core: { base: "#FFC968", roughness: 0.28, metalness: 0, emissive: "#FFC968", emissiveStrength: 1 },
    YE_Gravity_Tool: { base: "#54D8D0", roughness: 0.24, metalness: 0.12, emissive: "#2ABCB8", emissiveStrength: 0.85 },
    YE_Wing_Glass: { base: "#CFEFF1", roughness: 0.30, metalness: 0, opacity: 0.72, alphaMode: "BLEND" },
    YE_Exposed: { base: "#3A2628", roughness: 0.72, metalness: 0 }
  }
});

export const APPROVED_ANCHORS = deepFreeze([
  { path: "docs/superpowers/assets/yue-e/e-traveler-approved.png", width: 1536, height: 1024, sha256: "FE9724E075730551AC657D93C81D3FFFA878C7E0A1D65F454FF890901D3F6F6D" },
  { path: "docs/superpowers/assets/yue-e/e-traveler-actions-approved.png", width: 1774, height: 887, sha256: "468E922942179B00659F5B16CAF7361D059B7CB6E2ACEEC947867F93DB4EEB55" },
  { path: "docs/superpowers/assets/yue-e/camera-views-approved.png", width: 1817, height: 866, sha256: "1429B87737E92FFFAABA44577AF3579556B558F488A2A88787D20F7653312FBF" }
]);

export const POSE_PROBES = deepFreeze([
  { bone: "LowerArm_L", controlBone: "LowerArm_R", axis: [0, 0, 1], angleDegrees: 12, minimumMovedMeters: 0.002, maximumControlDriftMeters: 0.0005 },
  { bone: "Shin_R", controlBone: "Shin_L", axis: [1, 0, 0], angleDegrees: 12, minimumMovedMeters: 0.002, maximumControlDriftMeters: 0.0005 },
  { bone: "Wing03_L", controlBone: "Wing03_R", axis: [0, 1, 0], angleDegrees: 12, minimumMovedMeters: 0.002, maximumControlDriftMeters: 0.0005 },
  { bone: "Wing05_R", controlBone: "Wing05_L", axis: [0, 1, 0], angleDegrees: 12, minimumMovedMeters: 0.002, maximumControlDriftMeters: 0.0005 },
  { bone: "ToolRoot_R", controlBone: "Hand_L", axis: [0, 0, 1], angleDegrees: 12, minimumMovedMeters: 0.002, maximumControlDriftMeters: 0.0005 }
]);
```

- [ ] **Step 1.6: Add the exact 39-bone hierarchy and shared paths**

Append to `web/yue-e/character/lookdev-contract.js`:

```js
export const REQUIRED_BONE_PARENTS = deepFreeze({
  Root: null,
  Hips: "Root", Spine: "Hips", Chest: "Spine", Neck: "Chest", Head: "Neck",
  HairRoot: "Head", ChestCore: "Chest",
  Clavicle_L: "Chest", UpperArm_L: "Clavicle_L", LowerArm_L: "UpperArm_L", Hand_L: "LowerArm_L",
  Clavicle_R: "Chest", UpperArm_R: "Clavicle_R", LowerArm_R: "UpperArm_R", Hand_R: "LowerArm_R",
  Thigh_L: "Hips", Shin_L: "Thigh_L", Foot_L: "Shin_L", Toe_L: "Foot_L",
  Thigh_R: "Hips", Shin_R: "Thigh_R", Foot_R: "Shin_R", Toe_R: "Foot_R",
  WingRoot_L: "Chest", Wing01_L: "WingRoot_L", Wing02_L: "WingRoot_L", Wing03_L: "WingRoot_L",
  Wing04_L: "WingRoot_L", Wing05_L: "WingRoot_L", Wing06_L: "WingRoot_L",
  WingRoot_R: "Chest", Wing01_R: "WingRoot_R", Wing02_R: "WingRoot_R", Wing03_R: "WingRoot_R",
  Wing04_R: "WingRoot_R", Wing05_R: "WingRoot_R", Wing06_R: "WingRoot_R",
  ToolRoot_R: "Hand_R"
});

export const REQUIRED_BONES = deepFreeze(Object.keys(REQUIRED_BONE_PARENTS));
export const REQUIRED_MATERIALS = deepFreeze(Object.keys(YUE_E_LOOKDEV.materials));
export const YUE_E_RESOURCE_IDS = deepFreeze({ travelerManifest: "yue-e.traveler.lookdev.manifest" });
export const LOOKDEV_CANDIDATE_PATH = "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-lookdev.glb";
export const LOOKDEV_BUILD_REPORT_PATH = "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-build-report.json";
export const LOOKDEV_GATE_PATH = "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json";
export const LOOKDEV_RUNTIME_PATH = "web/assets/yue-e/character/yue-e-traveler-lookdev.manifest.json";
```

- [ ] **Step 1.7: Run the contract checker GREEN**

Run:

```powershell
node scripts/check-yue-e-lookdev-contract.mjs
```

Expected final line:

```json
{"ok":true,"anchorCount":3,"boneCount":39,"materialCount":10,"poseProbeCount":5}
```

- [ ] **Step 1.8: Commit only the contract boundary**

Run:

```powershell
git add web/yue-e/package.json web/yue-e/character/lookdev-contract.js scripts/check-yue-e-lookdev-contract.mjs
git diff --cached --check
git diff --cached --name-only
git commit -m "test: lock Yue E traveler lookdev contract"
```

Expected: staged names are exactly the three files above; commit succeeds.

---

## Task 2: Build the deterministic Blender source, rig and candidate GLB

**Files:**

- Create: `scripts/yue-e/build-traveler-lookdev.mjs`
- Create: `scripts/yue-e/blender/yue_e_contract.py`
- Create: `scripts/yue-e/blender/yue_e_geometry.py`
- Create: `scripts/yue-e/blender/yue_e_rig.py`
- Create: `scripts/yue-e/blender/yue_e_artifacts.py`
- Create: `scripts/yue-e/blender/build_traveler_lookdev.py`
- Create: `scripts/check-yue-e-character-scene.mjs`
- Generate: the six Task 2 artifacts in the File Map

**Interfaces:**

- Consumes Task 1's exact material, bone-parent and pose-probe values; the Python mirror is checked against the JS contract report rather than allowed to drift.
- `build-traveler-lookdev.mjs --probe` writes no file and prints one JSON line.
- `build-traveler-lookdev.mjs --stage=lookdev --check-only` builds in memory and prints `BuildReport` without writing artifacts.
- `build-traveler-lookdev.mjs --stage=lookdev` writes all six artifacts and prints the same report with a non-null output hash.
- `check-yue-e-character-scene.mjs [--case=probe|geometry|rig|artifacts]` runs all cases in that order when omitted and rejects unknown cases.

- [ ] **Step 2.1: Write the failing Blender probe case**

Create `scripts/check-yue-e-character-scene.mjs`:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { REQUIRED_BONES, REQUIRED_BONE_PARENTS } from "../web/yue-e/character/lookdev-contract.js";

const root = path.resolve(import.meta.dirname, "..");
const wrapper = path.join(root, "scripts/yue-e/build-traveler-lookdev.mjs");
const requested = process.argv.find((value) => value.startsWith("--case="))?.slice(7) || "all";
const allowed = new Set(["all", "probe", "geometry", "rig", "artifacts"]);
assert.ok(allowed.has(requested), `unknown case: ${requested}`);

function runWrapper(args) {
  const result = spawnSync(process.execPath, [wrapper, ...args], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const line = result.stdout.trim().split(/\r?\n/).at(-1);
  return JSON.parse(line);
}

const cases = {
  probe() {
    const report = runWrapper(["--probe"]);
    assert.deepEqual(report, { ok: true, version: "5.1.2", buildHash: "ec6e62d40fa9" });
    assert.equal(/[A-Z]:\\|\/Users\//i.test(JSON.stringify(report)), false);
  }
};

for (const name of requested === "all" ? ["probe"] : [requested]) {
  assert.equal(typeof cases[name], "function", `case not implemented: ${name}`);
  cases[name]();
}
console.log(JSON.stringify({ ok: true, cases: requested === "all" ? ["probe"] : [requested] }));
```

- [ ] **Step 2.2: Run the probe RED**

Run:

```powershell
node scripts/check-yue-e-character-scene.mjs --case=probe
```

Expected: exit non-zero because `scripts/yue-e/build-traveler-lookdev.mjs` does not exist.

- [ ] **Step 2.3: Implement the exact Blender wrapper**

Create `scripts/yue-e/build-traveler-lookdev.mjs`:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const EXPECTED = Object.freeze({ version: "5.1.2", buildHash: "ec6e62d40fa9" });
const candidates = [
  process.env.FE_BLENDER_EXE,
  "E:\\New Folder\\blender.exe",
  "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe",
  "C:\\Program Files\\Blender Foundation\\Blender 5.1.2\\blender.exe"
].filter(Boolean);

function resolveBlender() {
  const executable = candidates.find((candidate) => existsSync(candidate));
  assert.ok(executable, "YUE_E_BLENDER_NOT_FOUND");
  return path.resolve(executable);
}

export function probeBlender(executable = resolveBlender()) {
  const result = spawnSync(executable, ["--version"], { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || "YUE_E_BLENDER_PROBE_FAILED");
  const version = result.stdout.match(/^Blender\s+([^\s]+)/m)?.[1] || "";
  const buildHash = result.stdout.match(/\(hash\s+([0-9a-f]+)/i)?.[1] || "";
  assert.equal(version, EXPECTED.version, "YUE_E_BLENDER_VERSION");
  assert.equal(buildHash, EXPECTED.buildHash, "YUE_E_BLENDER_BUILD_HASH");
  return { version, buildHash };
}

function finalJson(stdout) {
  for (const line of stdout.trim().split(/\r?\n/).reverse()) {
    try { return JSON.parse(line); } catch {}
  }
  throw new Error("YUE_E_BLENDER_REPORT_MISSING");
}

export function runBlenderBuild({ stage = "lookdev", checkOnly = false } = {}) {
  assert.equal(stage, "lookdev", "YUE_E_STAGE_UNKNOWN");
  const executable = resolveBlender();
  probeBlender(executable);
  const script = path.join(root, "scripts/yue-e/blender/build_traveler_lookdev.py");
  const args = ["--background", "--factory-startup", "--python", script, "--", "--stage", stage];
  if (checkOnly) args.push("--check-only");
  const result = spawnSync(executable, args, { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = finalJson(result.stdout);
  assert.equal(report.blenderVersion, EXPECTED.version);
  assert.equal(report.blenderBuildHash, EXPECTED.buildHash);
  assert.equal(JSON.stringify(report).includes(path.parse(root).root), false, "YUE_E_ABSOLUTE_PATH_LEAK");
  return report;
}

const direct = path.resolve(process.argv[1] || "") === path.resolve(import.meta.filename);
if (direct) {
  const probe = process.argv.includes("--probe");
  const stageArg = process.argv.find((value) => value.startsWith("--stage="));
  assert.equal(probe && Boolean(stageArg), false, "YUE_E_ARGUMENT_CONFLICT");
  const output = probe
    ? { ok: true, ...probeBlender() }
    : runBlenderBuild({ stage: stageArg?.slice(8) || "lookdev", checkOnly: process.argv.includes("--check-only") });
  console.log(JSON.stringify(output));
}
```

- [ ] **Step 2.4: Run the exact probe GREEN**

Run:

```powershell
node scripts/check-yue-e-character-scene.mjs --case=probe
```

Expected final line:

```json
{"ok":true,"cases":["probe"]}
```

- [ ] **Step 2.5: Commit the locked Blender discovery seam**

Run:

```powershell
git add scripts/yue-e/build-traveler-lookdev.mjs scripts/check-yue-e-character-scene.mjs
git diff --cached --check
git commit -m "test: lock Yue E Blender toolchain"
```

Expected: commit succeeds without generated assets.

- [ ] **Step 2.6: Add the failing geometry assertions**

Extend the `cases` object in `scripts/check-yue-e-character-scene.mjs` with:

```js
  geometry() {
    const report = runWrapper(["--stage=lookdev", "--check-only"]);
    assert.equal(report.ok, true);
    assert.equal(report.stage, "lookdev");
    assert.equal(report.triangles >= 35_000 && report.triangles <= 60_000, true);
    assert.equal(report.heightMeters >= 1.30 && report.heightMeters <= 1.40, true);
    assert.equal(Math.abs(report.bodyBounds.min[1]) <= 0.005, true);
    assert.equal(report.feetMidpointDistanceFromOrigin <= 0.01, true);
    assert.equal(report.forwardMarkerAxis, "-Z");
    assert.equal(report.wingPanelCount, 12);
    assert.equal(new Set(report.lod0SemanticIds).size, report.lod0SemanticIds.length);
    assert.equal(report.lod0SemanticIds.every((id) => id.startsWith("yue-e.lod0.")), true);
    assert.deepEqual(report.materialNames, [
      "YE_Boots", "YE_Chest_Core", "YE_Coral_Trim", "YE_Exposed", "YE_Gravity_Tool",
      "YE_Hair", "YE_Shorts", "YE_Tunic_Ivory", "YE_Visor", "YE_Wing_Glass"
    ]);
    assert.equal(report.trueVolumePartCount >= 32, true);
  },
```

Also change the all-case list to `['probe', 'geometry']`.

- [ ] **Step 2.7: Run the geometry RED**

Run:

```powershell
node scripts/check-yue-e-character-scene.mjs --case=geometry
```

Expected: exit non-zero because `build_traveler_lookdev.py` is absent.

- [ ] **Step 2.8: Create Blender-side immutable material/part data**

Create `scripts/yue-e/blender/yue_e_contract.py` with these concrete definitions:

```python
from dataclasses import dataclass

BLENDER_VERSION = "5.1.2"
BLENDER_BUILD_HASH = "ec6e62d40fa9"
SEMANTIC_PREFIX = "yue-e.lod0."

MATERIALS = {
    "YE_Visor": ("081426", 0.34, 0.04, None, 0.0, 1.0),
    "YE_Hair": ("F3F1E8", 0.62, 0.00, "171713", 0.06, 1.0),
    "YE_Tunic_Ivory": ("F1E6CF", 0.76, 0.00, None, 0.0, 1.0),
    "YE_Coral_Trim": ("E88768", 0.70, 0.00, None, 0.0, 1.0),
    "YE_Shorts": ("172642", 0.82, 0.00, None, 0.0, 1.0),
    "YE_Boots": ("E8DDC8", 0.78, 0.00, None, 0.0, 1.0),
    "YE_Chest_Core": ("FFC968", 0.28, 0.00, "FFC968", 1.0, 1.0),
    "YE_Gravity_Tool": ("54D8D0", 0.24, 0.12, "2ABCB8", 0.85, 1.0),
    "YE_Wing_Glass": ("CFEFF1", 0.30, 0.00, None, 0.0, 0.72),
    "YE_Exposed": ("3A2628", 0.72, 0.00, None, 0.0, 1.0),
}

@dataclass(frozen=True)
class PartSpec:
    semantic: str
    shape: str
    location: tuple[float, float, float]
    scale: tuple[float, float, float]
    bone: str
    material: str
    region: str = "body"
    blend_bone: str | None = None

PARTS = [
    PartSpec("head", "ELLIPSOID", (0, 0, 1.155), (0.235, 0.205, 0.195), "Head", "YE_Exposed"),
    PartSpec("visor", "ELLIPSOID", (0, 0.174, 1.155), (0.196, 0.032, 0.135), "Head", "YE_Visor"),
    PartSpec("visor.dash.left", "BEVELED_BOX", (-0.065, 0.211, 1.16), (0.045, 0.010, 0.008), "Head", "YE_Chest_Core"),
    PartSpec("visor.dash.right", "BEVELED_BOX", (0.065, 0.211, 1.16), (0.045, 0.010, 0.008), "Head", "YE_Chest_Core"),
    PartSpec("tunic", "CONE", (0, 0, 0.785), (0.245, 0.175, 0.275), "Spine", "YE_Tunic_Ivory", blend_bone="Chest"),
    PartSpec("tunic.hem", "CONE", (0, 0, 0.605), (0.275, 0.195, 0.075), "Hips", "YE_Coral_Trim", blend_bone="Spine"),
    PartSpec("shorts.left", "ELLIPSOID", (-0.105, 0, 0.54), (0.135, 0.145, 0.135), "Hips", "YE_Shorts", blend_bone="Thigh_L"),
    PartSpec("shorts.right", "ELLIPSOID", (0.105, 0, 0.54), (0.135, 0.145, 0.135), "Hips", "YE_Shorts", blend_bone="Thigh_R"),
    PartSpec("chest.core", "ELLIPSOID", (0, 0.184, 0.86), (0.055, 0.025, 0.055), "ChestCore", "YE_Chest_Core"),
]

for side, sign in (("left", -1), ("right", 1)):
    suffix = "L" if sign < 0 else "R"
    PARTS.extend([
        PartSpec(f"arm.{side}.upper", "ELLIPSOID", (0.29 * sign, 0, 0.80), (0.075, 0.075, 0.18), f"UpperArm_{suffix}", "YE_Tunic_Ivory", blend_bone=f"LowerArm_{suffix}"),
        PartSpec(f"arm.{side}.lower", "ELLIPSOID", (0.36 * sign, 0.01, 0.58), (0.065, 0.065, 0.16), f"LowerArm_{suffix}", "YE_Exposed", blend_bone=f"Hand_{suffix}"),
        PartSpec(f"hand.{side}", "ELLIPSOID", (0.39 * sign, 0.04, 0.42), (0.07, 0.075, 0.08), f"Hand_{suffix}", "YE_Exposed"),
        PartSpec(f"leg.{side}.thigh", "ELLIPSOID", (0.105 * sign, 0, 0.41), (0.10, 0.105, 0.16), f"Thigh_{suffix}", "YE_Shorts", blend_bone=f"Shin_{suffix}"),
        PartSpec(f"leg.{side}.shin", "ELLIPSOID", (0.105 * sign, 0, 0.23), (0.082, 0.085, 0.14), f"Shin_{suffix}", "YE_Exposed", blend_bone=f"Foot_{suffix}"),
        PartSpec(f"boot.{side}", "BEVELED_BOX", (0.105 * sign, 0.0, 0.105), (0.105, 0.15, 0.105), f"Foot_{suffix}", "YE_Boots"),
        PartSpec(f"toe.{side}", "ELLIPSOID", (0.105 * sign, 0.135, 0.07), (0.10, 0.12, 0.065), f"Toe_{suffix}", "YE_Boots"),
    ])

for index, (x, y, z, sx, sy, sz) in enumerate([
    (-0.14, -0.02, 1.29, .11, .11, .08), (0.14, -0.02, 1.29, .11, .11, .08),
    (-0.21, -0.01, 1.20, .10, .10, .10), (0.21, -0.01, 1.20, .10, .10, .10),
    (-0.17, -0.07, 1.08, .11, .09, .10), (0.17, -0.07, 1.08, .11, .09, .10),
    (-0.05, -0.12, 1.32, .09, .08, .06), (0.05, -0.12, 1.32, .09, .08, .06),
], 1):
    PARTS.append(PartSpec(f"hair.clump.{index:02d}", "ELLIPSOID", (x, y, z), (sx, sy, sz), "HairRoot", "YE_Hair"))

for side, sign in (("left", -1), ("right", 1)):
    suffix = "L" if sign < 0 else "R"
    for panel in range(1, 7):
        PARTS.append(PartSpec(
            f"wing.{side}.{panel:02d}", "BEVELED_BOX",
            (sign * (0.25 + panel * 0.085), -0.13, 0.88 - panel * 0.025),
            (0.075, 0.025, 0.24 - panel * 0.012),
            f"Wing{panel:02d}_{suffix}", "YE_Wing_Glass", "wing"
        ))

PARTS.extend([
    PartSpec("tool.brace", "BEVELED_BOX", (0.405, 0.03, 0.47), (0.09, 0.09, 0.055), "ToolRoot_R", "YE_Gravity_Tool", "tool"),
    PartSpec("tool.core", "ELLIPSOID", (0.43, 0.09, 0.47), (0.035, 0.025, 0.035), "ToolRoot_R", "YE_Gravity_Tool", "tool"),
])
```

- [ ] **Step 2.9: Implement deterministic material and volume-mesh creation**

Create `scripts/yue-e/blender/yue_e_geometry.py`:

```python
import bpy
from mathutils import Vector
from yue_e_contract import MATERIALS, PARTS, SEMANTIC_PREFIX

def rgba(hex_value: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    rgb = tuple(int(hex_value[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (*rgb, alpha)

def create_materials() -> dict[str, bpy.types.Material]:
    result = {}
    for name, (base, roughness, metalness, emissive, strength, alpha) in MATERIALS.items():
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        shader = material.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Base Color"].default_value = rgba(base, alpha)
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Metallic"].default_value = metalness
        shader.inputs["Alpha"].default_value = alpha
        if emissive:
            shader.inputs["Emission Color"].default_value = rgba(emissive)
            shader.inputs["Emission Strength"].default_value = strength
        material.diffuse_color = rgba(base, alpha)
        if alpha < 1.0:
            material.surface_render_method = "DITHERED"
            material.use_transparency_overlap = False
        result[name] = material
    return result

def _apply_bevel(obj: bpy.types.Object, width: float) -> None:
    modifier = obj.modifiers.new("YE_Bevel", "BEVEL")
    modifier.width = width
    modifier.segments = 3
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)

def create_part(spec, materials) -> bpy.types.Object:
    if spec.shape == "ELLIPSOID":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=36, ring_count=18, location=spec.location)
    elif spec.shape == "CONE":
        bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=1.0, radius2=0.72, depth=2.0, location=spec.location)
    elif spec.shape == "BEVELED_BOX":
        bpy.ops.mesh.primitive_cube_add(location=spec.location)
    else:
        raise RuntimeError(f"Unknown part shape: {spec.shape}")
    obj = bpy.context.object
    obj.name = f"YE_{spec.semantic.replace('.', '_')}"
    obj.scale = spec.scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if spec.shape == "BEVELED_BOX":
        _apply_bevel(obj, min(spec.scale) * 0.20)
    obj.data.materials.append(materials[spec.material])
    obj["yueERegion"] = spec.region
    obj["yueELod"] = 0
    obj["yueESemanticId"] = f"{SEMANTIC_PREFIX}{spec.semantic}"
    obj["yueEBone"] = spec.bone
    if spec.blend_bone:
        obj["yueEBlendBone"] = spec.blend_bone
    for polygon in obj.data.polygons:
        polygon.use_smooth = spec.shape != "BEVELED_BOX"
    return obj

def build_geometry(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    materials = create_materials()
    objects = []
    for spec in PARTS:
        obj = create_part(spec, materials)
        for owner in tuple(obj.users_collection):
            owner.objects.unlink(obj)
        collection.objects.link(obj)
        objects.append(obj)
    marker = bpy.data.objects.new("ForwardMarker", None)
    marker.location = Vector((0.0, 0.30, 0.70))
    marker["yueEForward"] = True
    collection.objects.link(marker)
    return objects
```

- [ ] **Step 2.10: Add geometry metrics and a no-write check-only orchestrator**

Create `scripts/yue-e/blender/build_traveler_lookdev.py`:

```python
import argparse
import bpy
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from yue_e_contract import BLENDER_BUILD_HASH, BLENDER_VERSION, MATERIALS
from yue_e_geometry import build_geometry

def parse_args():
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=("lookdev",), required=True)
    parser.add_argument("--check-only", action="store_true")
    return parser.parse_args(tail)

def gltf_point(world):
    return (float(world.x), float(world.z), float(-world.y))

def geometry_report(objects):
    body_points = []
    all_points = []
    foot_centers = {}
    triangles = 0
    semantic_ids = []
    for obj in objects:
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        semantic_ids.append(obj["yueESemanticId"])
        for vertex in mesh.vertices:
            point = gltf_point(evaluated.matrix_world @ vertex.co)
            all_points.append(point)
            if obj["yueERegion"] == "body":
                body_points.append(point)
        if obj["yueESemanticId"] in {"yue-e.lod0.boot.left", "yue-e.lod0.boot.right"}:
            foot_centers[obj["yueESemanticId"]] = gltf_point(evaluated.matrix_world.translation)
        evaluated.to_mesh_clear()
    body_min = [min(point[axis] for point in body_points) for axis in range(3)]
    body_max = [max(point[axis] for point in body_points) for axis in range(3)]
    full_min = [min(point[axis] for point in all_points) for axis in range(3)]
    full_max = [max(point[axis] for point in all_points) for axis in range(3)]
    radial = max((point[0] ** 2 + point[2] ** 2) ** 0.5 for point in body_points)
    left = foot_centers["yue-e.lod0.boot.left"]
    right = foot_centers["yue-e.lod0.boot.right"]
    feet_midpoint = [(left[axis] + right[axis]) * .5 for axis in range(3)]
    return {
        "triangles": triangles,
        "heightMeters": full_max[1] - full_min[1],
        "bodyBounds": {"min": body_min, "max": body_max},
        "bodyMaxRadialDistance": radial,
        "lod0SemanticIds": sorted(semantic_ids),
        "materialNames": sorted(MATERIALS),
        "wingPanelCount": sum(obj["yueERegion"] == "wing" for obj in objects),
        "trueVolumePartCount": len(objects),
        "feetMidpointDistanceFromOrigin": (feet_midpoint[0] ** 2 + feet_midpoint[2] ** 2) ** .5,
        "forwardMarkerAxis": "-Z"
    }

def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    model = bpy.data.collections.new("YE_Model_LOD0")
    scene.collection.children.link(model)
    objects = build_geometry(model)
    report = {
        "ok": True,
        "stage": "lookdev",
        "blenderVersion": bpy.app.version_string,
        "blenderBuildHash": bpy.app.build_hash.decode("ascii"),
        **geometry_report(objects),
        "boneNames": [], "boneParents": {}, "sourcePoseProbes": [],
        "sourceSha256": "0" * 64, "outputSha256": None
    }
    if report["blenderVersion"] != BLENDER_VERSION or report["blenderBuildHash"] != BLENDER_BUILD_HASH:
        raise RuntimeError("YUE_E_BLENDER_IDENTITY")
    print(json.dumps(report, sort_keys=True, separators=(",", ":")))

if __name__ == "__main__":
    main()
```

- [ ] **Step 2.11: Run the geometry check and require the authored range**

Run:

```powershell
node scripts/check-yue-e-character-scene.mjs --case=geometry
```

Expected: exit 0 and final JSON `{"ok":true,"cases":["geometry"]}`. If the exact generated triangle count is outside 35,000–60,000, change only the fixed `segments`, `ring_count`, cone vertices or bevel segments, rerun this command, and commit the resulting exact constants; never weaken the range assertion.

- [ ] **Step 2.12: Commit deterministic geometry before adding the rig**

Run:

```powershell
git add scripts/yue-e/blender/yue_e_contract.py scripts/yue-e/blender/yue_e_geometry.py scripts/yue-e/blender/build_traveler_lookdev.py scripts/check-yue-e-character-scene.mjs
git diff --cached --check
git commit -m "feat: build Yue E lookdev volume geometry"
```

- [ ] **Step 2.13: Add the failing rig assertions**

Extend the checker with:

```js
  rig() {
    const report = runWrapper(["--stage=lookdev", "--check-only"]);
    assert.deepEqual(report.boneNames, [...REQUIRED_BONES]);
    assert.deepEqual(report.boneParents, REQUIRED_BONE_PARENTS);
    assert.equal(report.armatureCount, 1);
    assert.equal(report.visibleSkinnedMeshCount, report.trueVolumePartCount);
    assert.equal(report.unweightedVertexCount, 0);
    assert.equal(report.maxInfluencesPerVertex <= 4, true);
    assert.equal(report.maximumBoneOwnership <= 0.45, true);
    assert.deepEqual(report.sourcePoseProbes.map(({ bone, passed }) => [bone, passed]), [
      ["LowerArm_L", true], ["Shin_R", true], ["Wing03_L", true],
      ["Wing05_R", true], ["ToolRoot_R", true]
    ]);
  },
```

Add `rig` to the all-case order.

- [ ] **Step 2.14: Run the rig RED**

Run:

```powershell
node scripts/check-yue-e-character-scene.mjs --case=rig
```

Expected: exit non-zero because `boneNames` is empty.

- [ ] **Step 2.15: Add the exact bone specs**

Append to `scripts/yue-e/blender/yue_e_contract.py`:

```python
@dataclass(frozen=True)
class BoneSpec:
    name: str
    head: tuple[float, float, float]
    tail: tuple[float, float, float]
    parent: str | None

BONES = [
    BoneSpec("Root", (0, 0, 0), (0, 0, .08), None),
    BoneSpec("Hips", (0, 0, .43), (0, 0, .57), "Root"),
    BoneSpec("Spine", (0, 0, .57), (0, 0, .75), "Hips"),
    BoneSpec("Chest", (0, 0, .75), (0, 0, .91), "Spine"),
    BoneSpec("Neck", (0, 0, .91), (0, 0, 1.02), "Chest"),
    BoneSpec("Head", (0, 0, 1.02), (0, 0, 1.26), "Neck"),
    BoneSpec("HairRoot", (0, -.04, 1.18), (0, -.04, 1.32), "Head"),
    BoneSpec("ChestCore", (0, .06, .80), (0, .16, .86), "Chest"),
]
for side, sign in (("L", -1), ("R", 1)):
    BONES.extend([
        BoneSpec(f"Clavicle_{side}", (.03 * sign, 0, .87), (.18 * sign, 0, .84), "Chest"),
        BoneSpec(f"UpperArm_{side}", (.18 * sign, 0, .84), (.31 * sign, 0, .67), f"Clavicle_{side}"),
        BoneSpec(f"LowerArm_{side}", (.31 * sign, 0, .67), (.38 * sign, 0, .49), f"UpperArm_{side}"),
        BoneSpec(f"Hand_{side}", (.38 * sign, 0, .49), (.40 * sign, .02, .40), f"LowerArm_{side}"),
        BoneSpec(f"Thigh_{side}", (.10 * sign, 0, .50), (.10 * sign, 0, .34), "Hips"),
        BoneSpec(f"Shin_{side}", (.10 * sign, 0, .34), (.10 * sign, 0, .17), f"Thigh_{side}"),
        BoneSpec(f"Foot_{side}", (.10 * sign, 0, .17), (.10 * sign, .10, .08), f"Shin_{side}"),
        BoneSpec(f"Toe_{side}", (.10 * sign, .10, .08), (.10 * sign, .22, .06), f"Foot_{side}"),
        BoneSpec(f"WingRoot_{side}", (.14 * sign, -.08, .87), (.24 * sign, -.12, .88), "Chest"),
    ])
    for panel in range(1, 7):
        BONES.append(BoneSpec(
            f"Wing{panel:02d}_{side}",
            (sign * (0.23 + panel * .07), -.12, .90 - panel * .02),
            (sign * (0.32 + panel * .09), -.14, .87 - panel * .03),
            f"WingRoot_{side}"
        ))
BONES.append(BoneSpec("ToolRoot_R", (.38, 0, .49), (.45, .08, .47), "Hand_R"))

POSE_PROBES = (
    ("LowerArm_L", "LowerArm_R", (0, 0, 1)),
    ("Shin_R", "Shin_L", (1, 0, 0)),
    ("Wing03_L", "Wing03_R", (0, 1, 0)),
    ("Wing05_R", "Wing05_L", (0, 1, 0)),
    ("ToolRoot_R", "Hand_L", (0, 0, 1)),
)
assert len(BONES) == 39
```

- [ ] **Step 2.16: Implement Armature, normalized weights and source pose probes**

Create `scripts/yue-e/blender/yue_e_rig.py`:

```python
import bpy
from math import radians
from mathutils import Quaternion, Vector
from yue_e_contract import BONES, POSE_PROBES

def create_armature(collection):
    data = bpy.data.armatures.new("YE_ArmatureData")
    armature = bpy.data.objects.new("YE_Armature", data)
    collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    created = {}
    for spec in BONES:
        bone = data.edit_bones.new(spec.name)
        bone.head, bone.tail = spec.head, spec.tail
        bone.parent = created.get(spec.parent)
        created[spec.name] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature

def assign_weights(obj, armature):
    primary = obj["yueEBone"]
    secondary = obj.get("yueEBlendBone")
    primary_group = obj.vertex_groups.new(name=primary)
    secondary_group = obj.vertex_groups.new(name=secondary) if secondary else None
    z_values = [vertex.co.z for vertex in obj.data.vertices]
    low, high = min(z_values), max(z_values)
    span = max(high - low, 1e-6)
    for vertex in obj.data.vertices:
        blend = 0.0 if secondary_group is None else max(0.0, min(0.35, ((vertex.co.z - low) / span) * 0.35))
        primary_group.add([vertex.index], 1.0 - blend, "REPLACE")
        if secondary_group is not None:
            secondary_group.add([vertex.index], blend, "REPLACE")
    modifier = obj.modifiers.new("YE_Armature", "ARMATURE")
    modifier.object = armature

def _evaluated_positions(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    values = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    evaluated.to_mesh_clear()
    return values

def run_source_pose_probes(armature, objects):
    results = []
    bpy.context.view_layer.objects.active = armature
    for bone_name, control_bone, axis in POSE_PROBES:
        bone = armature.pose.bones[bone_name]
        before = {obj.name: _evaluated_positions(obj) for obj in objects}
        original = bone.rotation_quaternion.copy()
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = Quaternion(Vector(axis), radians(12)) @ original
        bpy.context.view_layer.update()
        moved, controls = [], []
        for obj in objects:
            after = _evaluated_positions(obj)
            distances = [(a - b).length for a, b in zip(after, before[obj.name])]
            if obj["yueEBone"] == bone_name or obj.get("yueEBlendBone") == bone_name:
                moved.extend(distances)
            if obj["yueEBone"] == control_bone or obj.get("yueEBlendBone") == control_bone:
                controls.extend(distances)
        bone.rotation_quaternion = original
        bpy.context.view_layer.update()
        maximum_moved = max(moved, default=0.0)
        maximum_control = max(controls, default=0.0)
        results.append({
            "bone": bone_name,
            "movedVertexCount": sum(value >= .002 for value in moved),
            "maximumMovedMeters": maximum_moved,
            "controlVertexCount": len(controls),
            "maximumControlDriftMeters": maximum_control,
            "passed": maximum_moved >= .002 and maximum_control <= .0005
        })
    return results

def bind_geometry(collection, objects):
    armature = create_armature(collection)
    for obj in objects:
        assign_weights(obj, armature)
    probes = run_source_pose_probes(armature, objects)
    if not all(item["passed"] for item in probes):
        raise RuntimeError("YUE_E_SOURCE_POSE_PROBE")
    return armature, probes

def skinning_metrics(objects):
    ownership = {}
    total_weight = 0.0
    unweighted = 0
    maximum_influences = 0
    for obj in objects:
        for vertex in obj.data.vertices:
            active = [(obj.vertex_groups[item.group].name, item.weight) for item in vertex.groups if item.weight > 1e-6]
            if not active:
                unweighted += 1
                continue
            weight_sum = sum(weight for _, weight in active)
            if abs(weight_sum - 1.0) > 1e-5:
                raise RuntimeError("YUE_E_SOURCE_WEIGHT_SUM")
            maximum_influences = max(maximum_influences, len(active))
            total_weight += weight_sum
            for name, weight in active:
                ownership[name] = ownership.get(name, 0.0) + weight
    maximum_ownership = max(ownership.values(), default=0.0) / max(total_weight, 1.0)
    return unweighted, maximum_influences, maximum_ownership
```

- [ ] **Step 2.17: Wire rig metrics into the orchestrator**

Patch `build_traveler_lookdev.py` with these exact additions:

```python
from yue_e_contract import BONES
from yue_e_rig import bind_geometry, skinning_metrics

# immediately after objects = build_geometry(model)
armature, source_pose_probes = bind_geometry(model, objects)
unweighted_vertices, maximum_influences, maximum_ownership = skinning_metrics(objects)

# merge into report
"armatureCount": 1,
"visibleSkinnedMeshCount": len(objects),
"boneNames": [bone.name for bone in BONES],
"boneParents": {bone.name: bone.parent for bone in BONES},
"sourcePoseProbes": source_pose_probes,
"unweightedVertexCount": unweighted_vertices,
"maxInfluencesPerVertex": maximum_influences,
"maximumBoneOwnership": maximum_ownership,
```

- [ ] **Step 2.18: Run the rig check GREEN**

Run:

```powershell
node scripts/check-yue-e-character-scene.mjs --case=rig
```

Expected final line: `{"ok":true,"cases":["rig"]}` and all five source probes report `passed:true`.

- [ ] **Step 2.19: Commit the real rig and Blender deformation checks**

Run:

```powershell
git add scripts/yue-e/blender/yue_e_contract.py scripts/yue-e/blender/yue_e_rig.py scripts/yue-e/blender/build_traveler_lookdev.py scripts/check-yue-e-character-scene.mjs
git diff --cached --check
git commit -m "feat: rig and skin Yue E traveler lookdev"
```

- [ ] **Step 2.20: Add the failing artifact assertions**

Extend `scripts/check-yue-e-character-scene.mjs`:

```js
  artifacts() {
    const report = runWrapper(["--stage=lookdev"]);
    const required = [
      ["blender-source/yue-e/character/yue-e-traveler-lookdev.blend", 1024],
      ["docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-lookdev.glb", 1024],
      ["docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-material-palette.json", 128],
      ["docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-skeleton.md", 128],
      ["docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-proportion-board.png", 4096],
      ["docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-build-report.json", 512]
    ];
    for (const [relative, minimumBytes] of required) {
      const file = path.join(root, relative);
      assert.equal(existsSync(file), true, relative);
      assert.equal(readFileSync(file).byteLength >= minimumBytes, true, relative);
    }
    assert.match(report.outputSha256, /^[A-F0-9]{64}$/);
    assert.equal(JSON.stringify(report).includes(path.parse(root).root), false);
  },
```

Add `artifacts` to the all-case order.

- [ ] **Step 2.21: Run the artifact RED**

Run:

```powershell
node scripts/check-yue-e-character-scene.mjs --case=artifacts
```

Expected: exit non-zero because `yue_e_artifacts.py` and generated outputs do not exist.

- [ ] **Step 2.22: Implement glTF-coordinate metrics, the review board and exact exporter kwargs**

Create `scripts/yue-e/blender/yue_e_artifacts.py` with these operative functions:

```python
import bpy
import hashlib
import json
from pathlib import Path
from math import radians
from mathutils import Vector
from yue_e_contract import MATERIALS

EXPORT_KWARGS = {
    "export_format": "GLB", "export_yup": True, "export_extras": True,
    "export_skins": True, "export_apply": False, "export_influence_nb": 4,
    "export_all_influences": False, "export_animations": False,
    "export_cameras": False, "export_lights": False,
    "export_draco_mesh_compression_enable": False,
    "export_materials": "EXPORT", "export_image_format": "AUTO",
    "export_texcoords": True, "export_normals": True, "export_tangents": False,
    "export_attributes": False, "export_morph": False,
    "export_morph_normal": False, "export_morph_tangent": False,
    "export_vertex_color": "NONE", "export_shared_accessors": False,
    "export_try_sparse_sk": False, "export_try_omit_sparse_sk": False,
    "export_leaf_bone": False, "export_def_bones": False,
    "export_rest_position_armature": True, "export_armature_object_remove": True,
    "use_selection": True, "use_visible": False, "use_renderable": False,
    "use_active_collection": False, "export_keep_originals": False,
    "export_unused_images": False
}

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()

def select_export_objects(objects, armature, marker):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [*objects, armature, marker]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = armature

def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()

def add_board_label(scene, body, location, size=.10):
    curve = bpy.data.curves.new(f"YE_Label_{body}", "FONT")
    curve.body, curve.align_x, curve.size = body, "CENTER", size
    text = bpy.data.objects.new(f"YE_Label_{body}", curve)
    text.location = location
    text.rotation_euler = (radians(90), 0, 0)
    scene.collection.objects.link(text)
    return text

def add_height_guide(scene, x, height):
    curve = bpy.data.curves.new(f"YE_Guide_{height}", "CURVE")
    curve.dimensions, curve.bevel_depth = "3D", .006
    spline = curve.splines.new("POLY")
    spline.points.add(1)
    spline.points[0].co, spline.points[1].co = (x, .18, 0, 1), (x, .18, height, 1)
    guide = bpy.data.objects.new(f"YE_Guide_{height}", curve)
    scene.collection.objects.link(guide)
    add_board_label(scene, f"{height:.2f} M / 4.5 HEADS", (x, .20, height + .08), .075)

def render_proportion_board(model_collection, output: Path):
    scene = bpy.data.scenes.new("YE_ReviewBoard")
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 3200, 1800, 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("YE_ReviewWorld")
    scene.world.color = (0.055, 0.065, 0.08)
    bpy.context.window.scene = scene
    for index, (label, rotation) in enumerate((("FRONT", (0, 0, 0)), ("SIDE", (0, 0, radians(90))), ("BACK", (0, 0, radians(180))), ("TOP", (radians(90), 0, 0)))):
        instance = bpy.data.objects.new(f"YE_Board_{label}", None)
        instance.instance_type = "COLLECTION"
        instance.instance_collection = model_collection
        instance.location = (-2.55 + index * 1.70, 0, 0)
        instance.rotation_euler = rotation
        scene.collection.objects.link(instance)
        add_board_label(scene, label, (instance.location.x, .22, -.12), .12)
    add_height_guide(scene, -3.18, 1.35)
    for index, (name, values) in enumerate(sorted(MATERIALS.items())):
        base, _, _, _, _, alpha = values
        material = bpy.data.materials.get(name)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(-2.7 + index * .60, .20, -.34))
        swatch = bpy.context.object
        swatch.name, swatch.scale = f"YE_Swatch_{name}", (.24, .02, .06)
        swatch.data.materials.append(material)
        add_board_label(scene, name.removeprefix("YE_"), (swatch.location.x, .22, -.46), .035)
    camera_data = bpy.data.cameras.new("YE_BoardCamera")
    camera_data.type, camera_data.ortho_scale = "ORTHO", 7.0
    camera = bpy.data.objects.new("YE_BoardCamera", camera_data)
    camera.location = (0, 8, .72)
    look_at(camera, (0, 0, .72))
    scene.collection.objects.link(camera)
    scene.camera = camera
    key_data = bpy.data.lights.new("YE_BoardKey", "AREA")
    key_data.energy, key_data.shape, key_data.size = 950, "DISK", 5.0
    key = bpy.data.objects.new("YE_BoardKey", key_data)
    key.location = (-3, 4, 6)
    look_at(key, (0, 0, .7))
    scene.collection.objects.link(key)
    scene.render.filepath = str(output)
    bpy.context.window.scene = scene
    bpy.ops.render.render(write_still=True)

def write_artifacts(root: Path, model_collection, objects, armature, marker, report):
    source = root / "blender-source/yue-e/character/yue-e-traveler-lookdev.blend"
    lookdev = root / "docs/superpowers/assets/yue-e/lookdev"
    source.parent.mkdir(parents=True, exist_ok=True)
    lookdev.mkdir(parents=True, exist_ok=True)
    bpy.context.window.scene = bpy.data.scenes["Scene"]
    bpy.ops.wm.save_as_mainfile(filepath=str(source), compress=True)
    render_proportion_board(model_collection, lookdev / "yue-e-traveler-proportion-board.png")
    bpy.context.window.scene = bpy.data.scenes["Scene"]
    select_export_objects(objects, armature, marker)
    glb = lookdev / "yue-e-traveler-lookdev.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb), **EXPORT_KWARGS)
    report["sourceSha256"] = sha256(source)
    report["outputSha256"] = sha256(glb)
    palette = {name: {"baseHex": base, "roughness": roughness, "metalness": metalness,
                      "emissiveHex": emissive, "emissiveStrength": strength, "alpha": alpha}
               for name, (base, roughness, metalness, emissive, strength, alpha) in MATERIALS.items()}
    (lookdev / "yue-e-traveler-material-palette.json").write_text(json.dumps({"materials": palette}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    skeleton = ["# Yue E Traveler Skeleton", "", "| Bone | Parent | Head (Blender m) | Tail (Blender m) |", "| --- | --- | --- | --- |"]
    for bone in armature.data.bones:
        head = ", ".join(f"{value:.6f}" for value in bone.head_local)
        tail = ", ".join(f"{value:.6f}" for value in bone.tail_local)
        skeleton.append(f"| `{bone.name}` | `{report['boneParents'][bone.name] or '-'}` | `{head}` | `{tail}` |")
    skeleton.extend(["", "## Source pose probes", "", "| Bone | Moved m | Control drift m | Passed |", "| --- | ---: | ---: | --- |"])
    skeleton.extend(f"| `{probe['bone']}` | {probe['maximumMovedMeters']:.6f} | {probe['maximumControlDriftMeters']:.6f} | {str(probe['passed']).lower()} |" for probe in report["sourcePoseProbes"])
    (lookdev / "yue-e-traveler-skeleton.md").write_text("\n".join(skeleton) + "\n", encoding="utf-8")
    (lookdev / "yue-e-traveler-build-report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report
```

- [ ] **Step 2.23: Wire normal-build artifact output without weakening check-only**

Patch `build_traveler_lookdev.py`:

```python
from pathlib import Path
from yue_e_artifacts import write_artifacts

# after report construction
if not args.check_only:
    root = SCRIPT_DIR.parents[2]
    marker = bpy.data.objects["ForwardMarker"]
    report = write_artifacts(root, model, objects, armature, marker, report)
print(json.dumps(report, sort_keys=True, separators=(",", ":")))
```

Remove the earlier unconditional `print(...)` so the script prints exactly one final JSON report.

- [ ] **Step 2.24: Prove check-only writes nothing**

Run:

```powershell
$before = git status --short
node scripts/yue-e/build-traveler-lookdev.mjs --stage=lookdev --check-only
$after = git status --short
if ($before -ne $after) { throw "check-only changed the worktree" }
```

Expected: exit 0; before/after status strings are identical; report has `outputSha256:null`.

- [ ] **Step 2.25: Generate and validate all Task 2 artifacts**

Run:

```powershell
node scripts/yue-e/build-traveler-lookdev.mjs --stage=lookdev
node scripts/check-yue-e-character-scene.mjs
```

Expected: both commands exit 0; checker final JSON lists `probe`, `geometry`, `rig`, `artifacts`; build report contains version/hash, exact hierarchy, five passing source probes, glTF-coordinate `bodyBounds`, 12 wings, 35k–60k triangles and a 64-character uppercase `outputSha256`, with no absolute path.

- [ ] **Step 2.26: Commit source, builder and generated candidate evidence**

Run:

```powershell
git add scripts/yue-e/build-traveler-lookdev.mjs scripts/yue-e/blender scripts/check-yue-e-character-scene.mjs blender-source/yue-e/character docs/superpowers/assets/yue-e/lookdev
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: build rigged Yue E traveler lookdev"
```

Expected: no file under `web/assets/yue-e/` is staged.

---

## Task 3: Validate exported GLB bytes and write the pending approval gate

**Files:**

- Create: `scripts/yue-e/lib/glb-v2.mjs`
- Create: `scripts/yue-e/lib/yue-e-lookdev-gate.mjs`
- Create: `scripts/check-yue-e-glb-parser.mjs`
- Create: `scripts/check-yue-e-character-asset.mjs`
- Generate: `docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json`

**Interfaces:**

- Consumes the Task 1 contract and Task 2 candidate/build report.
- Produces a pending `LookdevGateV1` containing both `rigFingerprintSha256` and `approvedLod0VisualFingerprintSha256`.
- `rigFingerprintSha256` covers hierarchy, rest matrices, inverse-bind matrices, LOD0 POSITION/indices and JOINTS/WEIGHTS.
- `approvedLod0VisualFingerprintSha256` includes the rig hash plus every LOD0 primitive attribute/target accessor, indices, node rest transform/extras, primitive-to-material assignment, canonical full material/texture/sampler JSON and exact embedded image bytes. Animation arrays and explicitly tagged LOD1/LOD2 nodes are excluded; changes to LOD0 normals, tangents, UVs, colors, materials or images must invalidate it.

- [ ] **Step 3.1: Write the failing GLB container fixture**

Create `scripts/check-yue-e-glb-parser.mjs`:

```js
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

const requested = process.argv.find((value) => value.startsWith("--case="))?.slice(7) || "all";
assert.ok(new Set(["all", "container", "accessors", "fingerprints"]).has(requested), `unknown case: ${requested}`);

const pad4 = (buffer, byte = 0) => Buffer.concat([buffer, Buffer.alloc((4 - buffer.length % 4) % 4, byte)]);
const u32 = (...values) => {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeUInt32LE(value, index * 4));
  return buffer;
};
export function makeGlb(document, bin = Buffer.alloc(0)) {
  const json = pad4(Buffer.from(JSON.stringify(document), "utf8"), 0x20);
  const body = [
    u32(json.length, 0x4E4F534A), json,
    u32(pad4(bin).length, 0x004E4942), pad4(bin)
  ];
  const total = 12 + body.reduce((sum, chunk) => sum + chunk.length, 0);
  return Buffer.concat([u32(0x46546C67, 2, total), ...body]);
}

async function containerCase() {
  const { readGlbV2 } = await import("./yue-e/lib/glb-v2.mjs");
  const valid = makeGlb({ asset: { version: "2.0" }, buffers: [{ byteLength: 0 }] });
  const parsed = readGlbV2(valid);
  assert.equal(parsed.magic, "glTF");
  assert.equal(parsed.version, 2);
  assert.equal(parsed.declaredLength, valid.length);
  for (const mutate of [
    (bytes) => bytes.writeUInt32LE(0, 0),
    (bytes) => bytes.writeUInt32LE(1, 4),
    (bytes) => bytes.writeUInt32LE(bytes.length + 4, 8),
    (bytes) => bytes.writeUInt32LE(0x004E4942, 16)
  ]) {
    const broken = Buffer.from(valid);
    mutate(broken);
    assert.throws(() => readGlbV2(broken));
  }
}

const cases = { container: containerCase };
for (const name of requested === "all" ? ["container"] : [requested]) {
  assert.equal(typeof cases[name], "function", `case not implemented: ${name}`);
  await cases[name]();
}
console.log(JSON.stringify({ ok: true, cases: requested === "all" ? ["container"] : [requested] }));
```

- [ ] **Step 3.2: Run the container RED**

Run:

```powershell
node scripts/check-yue-e-glb-parser.mjs --case=container
```

Expected: exit non-zero with `ERR_MODULE_NOT_FOUND` for `glb-v2.mjs`.

- [ ] **Step 3.3: Implement strict GLB v2 container parsing**

Create `scripts/yue-e/lib/glb-v2.mjs`:

```js
import assert from "node:assert/strict";

const JSON_CHUNK = 0x4E4F534A;
const BIN_CHUNK = 0x004E4942;

export function readGlbV2(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  assert.equal(buffer.length >= 20, true, "GLB_TOO_SHORT");
  assert.equal(buffer.readUInt32LE(0), 0x46546C67, "GLB_MAGIC");
  assert.equal(buffer.readUInt32LE(4), 2, "GLB_VERSION");
  const declaredLength = buffer.readUInt32LE(8);
  assert.equal(declaredLength, buffer.length, "GLB_LENGTH");
  const chunks = [];
  let offset = 12;
  while (offset < buffer.length) {
    assert.equal(offset + 8 <= buffer.length, true, "GLB_CHUNK_HEADER_RANGE");
    const byteLength = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + byteLength;
    assert.equal(byteLength % 4, 0, "GLB_CHUNK_ALIGNMENT");
    assert.equal(end <= buffer.length, true, "GLB_CHUNK_RANGE");
    chunks.push({ type, byteLength, start, end, bytes: buffer.subarray(start, end) });
    offset = end;
  }
  assert.equal(offset, buffer.length, "GLB_TRAILING_BYTES");
  assert.equal(chunks[0]?.type, JSON_CHUNK, "GLB_JSON_FIRST");
  assert.equal(chunks.filter(({ type }) => type === JSON_CHUNK).length, 1, "GLB_JSON_COUNT");
  assert.equal(chunks.filter(({ type }) => type === BIN_CHUNK).length, 1, "GLB_BIN_COUNT");
  assert.equal(chunks.every(({ type }) => type === JSON_CHUNK || type === BIN_CHUNK), true, "GLB_UNKNOWN_CHUNK");
  const document = JSON.parse(chunks[0].bytes.toString("utf8").trimEnd());
  const bin = chunks.find(({ type }) => type === BIN_CHUNK).bytes;
  assert.equal(document.asset?.version, "2.0", "GLTF_ASSET_VERSION");
  assert.equal(document.buffers?.length, 1, "GLTF_BUFFER_COUNT");
  assert.equal(document.buffers[0].uri, undefined, "GLTF_EXTERNAL_BUFFER");
  assert.equal(document.buffers[0].byteLength <= bin.length, true, "GLTF_BIN_LENGTH");
  return { magic: "glTF", version: 2, declaredLength, byteLength: buffer.length, json: document, bin, chunks };
}
```

- [ ] **Step 3.4: Run the container fixture GREEN**

Run:

```powershell
node scripts/check-yue-e-glb-parser.mjs --case=container
```

Expected: `{"ok":true,"cases":["container"]}`.

- [ ] **Step 3.5: Add the failing accessor fixture**

Add this case to `scripts/check-yue-e-glb-parser.mjs`:

```js
async function accessorCase() {
  const { readAccessor } = await import("./yue-e/lib/glb-v2.mjs");
  const bin = Buffer.alloc(80, 0);
  bin.writeUInt16LE(0, 4); bin.writeUInt16LE(65535, 6);
  bin.writeFloatLE(1, 16); bin.writeFloatLE(2, 20); bin.writeFloatLE(3, 24);
  bin.writeFloatLE(4, 32); bin.writeFloatLE(5, 36); bin.writeFloatLE(6, 40);
  for (let index = 0; index < 16; index += 1) bin.writeFloatLE(index % 5 === 0 ? 1 : 0, 48 + index * 4);
  const document = {
    bufferViews: [
      { buffer: 0, byteOffset: 4, byteLength: 4 },
      { buffer: 0, byteOffset: 16, byteLength: 32, byteStride: 16 },
      { buffer: 0, byteOffset: 48, byteLength: 64 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5123, normalized: true, count: 2, type: "SCALAR" },
      { bufferView: 1, componentType: 5126, count: 2, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 1, type: "MAT4" },
      { bufferView: 0, componentType: 5123, normalized: true, count: 1, type: "VEC2" },
      { bufferView: 1, componentType: 5126, count: 2, type: "VEC4" }
    ]
  };
  assert.deepEqual(readAccessor(document, bin, 0).values, [[0], [1]]);
  assert.deepEqual(readAccessor(document, bin, 1).values, [[1, 2, 3], [4, 5, 6]]);
  assert.deepEqual(readAccessor(document, bin, 2).values[0], [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  assert.deepEqual(readAccessor(document, bin, 3).values, [[0, 1]]);
  assert.deepEqual(readAccessor(document, bin, 4).values, [[1, 2, 3, 0], [4, 5, 6, 0]]);
  assert.throws(() => readAccessor({ ...document, accessors: [{ ...document.accessors[0], componentType: 5124 }] }, bin, 0), /ACCESSOR_COMPONENT/);
  assert.throws(() => readAccessor({ ...document, accessors: [{ ...document.accessors[0], sparse: {} }] }, bin, 0), /ACCESSOR_SPARSE/);
  assert.throws(() => readAccessor({ ...document, accessors: [{ ...document.accessors[1], byteOffset: 30 }] }, bin, 0), /ACCESSOR_RANGE/);
}
```

Register `accessors: accessorCase` and change the all-case order to `['container', 'accessors']`.

- [ ] **Step 3.6: Run the accessor RED**

Run:

```powershell
node scripts/check-yue-e-glb-parser.mjs --case=accessors
```

Expected: exit non-zero because `readAccessor` is not exported.

- [ ] **Step 3.7: Implement legal accessor decoding**

Append to `scripts/yue-e/lib/glb-v2.mjs`:

```js
const COMPONENTS = new Map([
  [5120, { bytes: 1, read: "readInt8", min: -128, max: 127 }],
  [5121, { bytes: 1, read: "readUInt8", min: 0, max: 255 }],
  [5122, { bytes: 2, read: "readInt16LE", min: -32768, max: 32767 }],
  [5123, { bytes: 2, read: "readUInt16LE", min: 0, max: 65535 }],
  [5125, { bytes: 4, read: "readUInt32LE", min: 0, max: 4294967295 }],
  [5126, { bytes: 4, read: "readFloatLE", min: null, max: null }]
]);
const WIDTH = Object.freeze({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 });

function normalized(value, componentType, meta) {
  if (componentType === 5126) return value;
  if (meta.min === 0) return value / meta.max;
  return Math.max(value / meta.max, -1);
}

export function readAccessor(document, bin, accessorIndex) {
  const accessor = document.accessors?.[accessorIndex];
  assert.ok(accessor, "ACCESSOR_INDEX");
  assert.equal(accessor.sparse, undefined, "ACCESSOR_SPARSE");
  const component = COMPONENTS.get(accessor.componentType);
  assert.ok(component, "ACCESSOR_COMPONENT");
  const width = WIDTH[accessor.type];
  assert.ok(width, "ACCESSOR_TYPE");
  assert.equal(Number.isInteger(accessor.count) && accessor.count >= 0, true, "ACCESSOR_COUNT");
  const view = document.bufferViews?.[accessor.bufferView];
  assert.ok(view && view.buffer === 0, "ACCESSOR_BUFFER_VIEW");
  const packed = width * component.bytes;
  const stride = view.byteStride ?? packed;
  assert.equal(stride >= packed && stride % component.bytes === 0, true, "ACCESSOR_STRIDE");
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const end = accessor.count === 0 ? start : start + (accessor.count - 1) * stride + packed;
  assert.equal(start >= (view.byteOffset ?? 0) && end <= (view.byteOffset ?? 0) + view.byteLength && end <= bin.length, true, "ACCESSOR_RANGE");
  const values = [];
  for (let item = 0; item < accessor.count; item += 1) {
    const row = [];
    for (let lane = 0; lane < width; lane += 1) {
      const value = bin[component.read](start + item * stride + lane * component.bytes);
      assert.equal(Number.isFinite(value), true, "ACCESSOR_NONFINITE");
      row.push(accessor.normalized ? normalized(value, accessor.componentType, component) : value);
    }
    values.push(row);
  }
  return { meta: { componentType: accessor.componentType, type: accessor.type, count: accessor.count, normalized: Boolean(accessor.normalized) }, values };
}
```

- [ ] **Step 3.8: Run parser cases GREEN and commit**

Run:

```powershell
node scripts/check-yue-e-glb-parser.mjs
git add scripts/yue-e/lib/glb-v2.mjs scripts/check-yue-e-glb-parser.mjs
git diff --cached --check
git commit -m "test: add strict Yue E GLB parser"
```

Expected: parser JSON lists `container` and `accessors`; commit succeeds.

- [ ] **Step 3.9: Write the failing real-candidate semantic check**

Create `scripts/check-yue-e-character-asset.mjs`:

```js
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readGlbV2 } from "./yue-e/lib/glb-v2.mjs";
import {
  validateYueELookdev, writePendingGate
} from "./yue-e/lib/yue-e-lookdev-gate.mjs";

const root = path.resolve(import.meta.dirname, "..");
const stage = process.argv.find((value) => value.startsWith("--stage="))?.slice(8) || "lookdev";
assert.equal(stage, "lookdev", "YUE_E_STAGE_UNKNOWN");
const contractPath = path.join(root, "web/yue-e/character/lookdev-contract.js");
const contract = await import(`${pathToFileURL(contractPath).href}?asset-check=${Date.now()}`);
const candidatePath = path.join(root, contract.LOOKDEV_CANDIDATE_PATH);
const buildPath = path.join(root, contract.LOOKDEV_BUILD_REPORT_PATH);
const candidate = await readFile(candidatePath);
const buildReport = JSON.parse(await readFile(buildPath, "utf8"));
const glb = readGlbV2(candidate);
const report = validateYueELookdev(glb.json, glb.bin, contract, buildReport);

assert.equal(glb.declaredLength, glb.byteLength);
assert.equal(report.externalUriCount, 0);
assert.equal(report.skinCount >= 1, true);
assert.deepEqual(new Set(report.bones), new Set(contract.REQUIRED_BONES));
assert.deepEqual(report.boneParents, contract.REQUIRED_BONE_PARENTS);
assert.equal(report.bindPoseMaxResidual <= 1e-4, true);
assert.equal(report.exportedPoseProbes.every(({ passed }) => passed), true);
assert.equal(report.unweightedVertexCount, 0);
assert.equal(report.maxInfluencesPerVertex <= 4, true);
assert.equal(report.wingJointCount, 12);
assert.equal(report.triangles >= 35_000 && report.triangles <= 60_000, true);
assert.equal(report.heightMeters >= 1.30 && report.heightMeters <= 1.40, true);
assert.deepEqual(report.animations, []);
assert.match(report.rigFingerprintSha256, /^[A-F0-9]{64}$/);
assert.match(report.approvedLod0VisualFingerprintSha256, /^[A-F0-9]{64}$/);

if (process.argv.includes("--write-gate")) {
  await writePendingGate({ root, contractPath, candidatePath, buildPath, contract, report });
}
console.log(JSON.stringify({
  ok: true,
  modelSha256: createHash("sha256").update(candidate).digest("hex").toUpperCase(),
  boneCount: report.bones.length,
  wingJointCount: report.wingJointCount,
  materialCount: report.materialNames.length,
  animationCount: report.animations.length,
  rigFingerprintSha256: report.rigFingerprintSha256,
  approvedLod0VisualFingerprintSha256: report.approvedLod0VisualFingerprintSha256,
  approvalStatus: "pending"
}));
```

- [ ] **Step 3.10: Run the semantic check RED**

Run:

```powershell
node scripts/check-yue-e-character-asset.mjs --stage=lookdev
```

Expected: exit non-zero with `ERR_MODULE_NOT_FOUND` for `yue-e-lookdev-gate.mjs`.

- [ ] **Step 3.11: Implement canonical JSON, matrices and bind-pose residual**

Start `scripts/yue-e/lib/yue-e-lookdev-gate.mjs` with:

```js
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readAccessor, readGlbV2 } from "./glb-v2.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const canonicalBytes = (value) => Buffer.from(JSON.stringify(canonical(value)), "utf8");

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const multiply = (a, b) => {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let lane = 0; lane < 4; lane += 1) out[column * 4 + row] += a[lane * 4 + row] * b[column * 4 + lane];
    }
  }
  return out;
};
const inverse = (matrix) => {
  const rows = Array.from({ length: 4 }, (_, row) => [
    ...Array.from({ length: 4 }, (_, column) => matrix[column * 4 + row]),
    ...Array.from({ length: 4 }, (_, column) => Number(row === column))
  ]);
  for (let pivot = 0; pivot < 4; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < 4; row += 1) if (Math.abs(rows[row][pivot]) > Math.abs(rows[best][pivot])) best = row;
    [rows[pivot], rows[best]] = [rows[best], rows[pivot]];
    assert.equal(Math.abs(rows[pivot][pivot]) > 1e-12, true, "MATRIX_SINGULAR");
    const divisor = rows[pivot][pivot];
    rows[pivot] = rows[pivot].map((value) => value / divisor);
    for (let row = 0; row < 4; row += 1) {
      if (row === pivot) continue;
      const factor = rows[row][pivot];
      rows[row] = rows[row].map((value, column) => value - factor * rows[pivot][column]);
    }
  }
  return Array.from({ length: 16 }, (_, index) => rows[index % 4][4 + Math.floor(index / 4)]);
};

function localMatrix(node) {
  if (node.matrix) return [...node.matrix];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2*y*y - 2*z*z)*sx, (2*x*y + 2*z*w)*sx, (2*x*z - 2*y*w)*sx, 0,
    (2*x*y - 2*z*w)*sy, (1 - 2*x*x - 2*z*z)*sy, (2*y*z + 2*x*w)*sy, 0,
    (2*x*z + 2*y*w)*sz, (2*y*z - 2*x*w)*sz, (1 - 2*x*x - 2*y*y)*sz, 0,
    tx, ty, tz, 1
  ];
}

function worldMatrices(document, localOverrides = new Map()) {
  const parents = new Array(document.nodes?.length ?? 0).fill(-1);
  for (let parent = 0; parent < parents.length; parent += 1) {
    for (const child of document.nodes[parent].children ?? []) {
      assert.equal(parents[child], -1, "NODE_MULTIPLE_PARENTS");
      parents[child] = parent;
    }
  }
  const cache = new Map();
  const visit = (index, stack = new Set()) => {
    assert.equal(stack.has(index), false, "NODE_CYCLE");
    if (cache.has(index)) return cache.get(index);
    const next = new Set(stack).add(index);
    const local = localOverrides.get(index) ?? localMatrix(document.nodes[index]);
    const world = parents[index] < 0 ? local : multiply(visit(parents[index], next), local);
    cache.set(index, world);
    return world;
  };
  return { parents, matrices: document.nodes.map((_, index) => visit(index)) };
}

const residualFromIdentity = (matrix) => Math.max(...matrix.map((value, index) => Math.abs(value - identity()[index])));
const determinant3 = (matrix) =>
  matrix[0] * (matrix[5] * matrix[10] - matrix[6] * matrix[9]) -
  matrix[4] * (matrix[1] * matrix[10] - matrix[2] * matrix[9]) +
  matrix[8] * (matrix[1] * matrix[6] - matrix[2] * matrix[5]);
```

- [ ] **Step 3.12: Implement exported-byte CPU skin probes**

Append to `yue-e-lookdev-gate.mjs`:

```js
const transformPoint = (matrix, point) => [
  matrix[0]*point[0] + matrix[4]*point[1] + matrix[8]*point[2] + matrix[12],
  matrix[1]*point[0] + matrix[5]*point[1] + matrix[9]*point[2] + matrix[13],
  matrix[2]*point[0] + matrix[6]*point[1] + matrix[10]*point[2] + matrix[14]
];
const distance = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);

function axisQuaternion([ax, ay, az], degrees) {
  const length = Math.hypot(ax, ay, az);
  const half = degrees * Math.PI / 360;
  const scale = Math.sin(half) / length;
  return [ax * scale, ay * scale, az * scale, Math.cos(half)];
}

function posedLocal(node, axis, degrees) {
  const base = node.rotation ?? [0, 0, 0, 1];
  const delta = axisQuaternion(axis, degrees);
  const [ax, ay, az, aw] = delta, [bx, by, bz, bw] = base;
  return localMatrix({ ...node, rotation: [
    aw*bx + ax*bw + ay*bz - az*by,
    aw*by - ax*bz + ay*bw + az*bx,
    aw*bz + ax*by - ay*bx + az*bw,
    aw*bw - ax*bx - ay*by - az*bz
  ] });
}

function skinVertex(position, joints, weights, jointMatrices) {
  const out = [0, 0, 0];
  for (let lane = 0; lane < 4; lane += 1) {
    if (weights[lane] <= 0) continue;
    const point = transformPoint(jointMatrices[joints[lane]], position);
    out[0] += point[0] * weights[lane]; out[1] += point[1] * weights[lane]; out[2] += point[2] * weights[lane];
  }
  return out;
}

function exportedPoseProbes(document, bin, probes, nodeNames) {
  const rest = worldMatrices(document);
  const results = [];
  for (const probe of probes) {
    const boneNode = nodeNames.get(probe.bone);
    const controlNode = nodeNames.get(probe.controlBone);
    assert.notEqual(boneNode, undefined, `POSE_BONE_${probe.bone}`);
    const posed = worldMatrices(document, new Map([[boneNode, posedLocal(document.nodes[boneNode], probe.axis, probe.angleDegrees)]]));
    const moved = [], controls = [];
    for (let meshNode = 0; meshNode < document.nodes.length; meshNode += 1) {
      const node = document.nodes[meshNode];
      if (node.mesh === undefined || node.skin === undefined || node.extras?.yueELod !== 0) continue;
      const skin = document.skins[node.skin];
      const inverseBind = readAccessor(document, bin, skin.inverseBindMatrices).values;
      const restPalette = skin.joints.map((joint, index) => multiply(multiply(inverse(rest.matrices[meshNode]), rest.matrices[joint]), inverseBind[index]));
      const posedPalette = skin.joints.map((joint, index) => multiply(multiply(inverse(posed.matrices[meshNode]), posed.matrices[joint]), inverseBind[index]));
      const bonePaletteIndex = skin.joints.indexOf(boneNode);
      const controlPaletteIndex = skin.joints.indexOf(controlNode);
      for (const primitive of document.meshes[node.mesh].primitives) {
        const positions = readAccessor(document, bin, primitive.attributes.POSITION).values;
        const joints = readAccessor(document, bin, primitive.attributes.JOINTS_0).values;
        const weights = readAccessor(document, bin, primitive.attributes.WEIGHTS_0).values;
        for (let vertex = 0; vertex < positions.length; vertex += 1) {
          const before = skinVertex(positions[vertex], joints[vertex], weights[vertex], restPalette);
          const after = skinVertex(positions[vertex], joints[vertex], weights[vertex], posedPalette);
          const delta = distance(before, after);
          const targetWeight = joints[vertex].reduce((sum, joint, lane) => sum + (joint === bonePaletteIndex ? weights[vertex][lane] : 0), 0);
          const controlWeight = joints[vertex].reduce((sum, joint, lane) => sum + (joint === controlPaletteIndex ? weights[vertex][lane] : 0), 0);
          if (targetWeight >= .25) moved.push(delta);
          if (controlWeight >= .50) controls.push(delta);
        }
      }
    }
    const maximumMovedMeters = Math.max(...moved, 0);
    const maximumControlDriftMeters = Math.max(...controls, 0);
    results.push({
      bone: probe.bone,
      movedVertexCount: moved.filter((value) => value >= probe.minimumMovedMeters).length,
      maximumMovedMeters,
      controlVertexCount: controls.length,
      maximumControlDriftMeters,
      passed: maximumMovedMeters >= probe.minimumMovedMeters && controls.length > 0 && maximumControlDriftMeters <= probe.maximumControlDriftMeters
    });
  }
  return results;
}
```

- [ ] **Step 3.13: Implement complete rig and approved-LOD0 visual fingerprints**

Append:

```js
function accessorPayload(document, bin, index) {
  const decoded = readAccessor(document, bin, index);
  return { ...decoded.meta, values: decoded.values };
}

function embeddedImages(document, bin, imageIndices) {
  return [...imageIndices].sort((a, b) => a - b).map((index) => {
    const image = document.images?.[index];
    assert.ok(image, "IMAGE_INDEX");
    assert.equal(image.uri, undefined, "IMAGE_EXTERNAL_URI");
    const view = document.bufferViews?.[image.bufferView];
    assert.ok(view && view.buffer === 0, "IMAGE_BUFFER_VIEW");
    const start = view.byteOffset ?? 0;
    const bytes = bin.subarray(start, start + view.byteLength);
    return { index, name: image.name ?? "", mimeType: image.mimeType ?? "", byteLength: bytes.length, sha256: sha256(bytes) };
  });
}

function collectTextureIndices(material) {
  const indices = new Set();
  const visit = (value, key = "") => {
    if (!value || typeof value !== "object") return;
    if (key.endsWith("Texture") && Number.isInteger(value.index)) indices.add(value.index);
    for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
  };
  visit(material);
  return indices;
}

function imageDimensions(bytes, mimeType) {
  if (mimeType === "image/png") {
    assert.equal(bytes.length >= 24 && bytes.subarray(1, 4).toString("ascii") === "PNG", true, "PNG_HEADER");
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  assert.equal(mimeType === "image/jpeg" && bytes[0] === 0xFF && bytes[1] === 0xD8, true, "IMAGE_MIME");
  let offset = 2;
  while (offset + 9 < bytes.length) {
    while (bytes[offset] === 0xFF) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xD8 || marker === 0xD9) continue;
    const length = bytes.readUInt16BE(offset);
    assert.equal(length >= 2 && offset + length <= bytes.length, true, "JPEG_SEGMENT");
    if ([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF].includes(marker)) {
      return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
    }
    offset += length;
  }
  throw new Error("JPEG_DIMENSIONS");
}

function validateEmbeddedImageDimensions(document, bin) {
  for (const image of document.images ?? []) {
    assert.equal(image.uri, undefined, "IMAGE_EXTERNAL_URI");
    const view = document.bufferViews?.[image.bufferView];
    assert.ok(view && view.buffer === 0, "IMAGE_BUFFER_VIEW");
    const start = view.byteOffset ?? 0;
    const bytes = bin.subarray(start, start + view.byteLength);
    const [width, height] = imageDimensions(bytes, image.mimeType);
    assert.equal(width > 0 && height > 0 && width <= 2048 && height <= 2048, true, "IMAGE_DIMENSIONS");
  }
}

function lod0Resources(document, lod0Nodes) {
  const materialIndices = new Set();
  for (const { node } of lod0Nodes) {
    for (const primitive of document.meshes[node.mesh].primitives) {
      if (Number.isInteger(primitive.material)) materialIndices.add(primitive.material);
    }
  }
  const textureIndices = new Set();
  for (const index of materialIndices) {
    assert.ok(document.materials?.[index], "MATERIAL_INDEX");
    for (const texture of collectTextureIndices(document.materials[index])) textureIndices.add(texture);
  }
  const samplerIndices = new Set();
  const imageIndices = new Set();
  for (const index of textureIndices) {
    const texture = document.textures?.[index];
    assert.ok(texture, "TEXTURE_INDEX");
    if (Number.isInteger(texture.sampler)) samplerIndices.add(texture.sampler);
    if (Number.isInteger(texture.source)) imageIndices.add(texture.source);
    for (const extension of Object.values(texture.extensions ?? {})) {
      if (Number.isInteger(extension?.source)) imageIndices.add(extension.source);
    }
  }
  return { materialIndices, textureIndices, samplerIndices, imageIndices };
}

export function canonicalRigFingerprint(report) {
  return sha256(canonicalBytes(report.rigFingerprintInput));
}

export function canonicalApprovedLod0VisualFingerprint(document, bin, report) {
  const lod0Nodes = document.nodes
    .map((node, nodeIndex) => ({ node, nodeIndex }))
    .filter(({ node }) => node.mesh !== undefined && node.extras?.yueELod === 0)
    .sort((a, b) => a.node.extras.yueESemanticId.localeCompare(b.node.extras.yueESemanticId));
  const nodes = lod0Nodes.map(({ node, nodeIndex }) => ({
    semanticId: node.extras.yueESemanticId,
    region: node.extras.yueERegion,
    restWorldMatrix: report.nodeWorldMatrices[nodeIndex],
    primitives: document.meshes[node.mesh].primitives.map((primitive, primitiveOrdinal) => ({
      primitiveOrdinal,
      mode: primitive.mode ?? 4,
      material: primitive.material,
      indices: primitive.indices === undefined ? null : accessorPayload(document, bin, primitive.indices),
      attributes: Object.fromEntries(Object.entries(primitive.attributes).sort(([a], [b]) => a.localeCompare(b)).map(([semantic, index]) => [semantic, accessorPayload(document, bin, index)])),
      targets: (primitive.targets ?? []).map((target) => Object.fromEntries(Object.entries(target).sort(([a], [b]) => a.localeCompare(b)).map(([semantic, index]) => [semantic, accessorPayload(document, bin, index)])))
    }))
  }));
  const resources = lod0Resources(document, lod0Nodes);
  const indexed = (values, indices) => [...indices].sort((a, b) => a - b).map((index) => ({ index, value: values?.[index] }));
  const payload = {
    version: 1,
    rigFingerprintSha256: report.rigFingerprintSha256,
    nodes,
    materials: indexed(document.materials, resources.materialIndices),
    textures: indexed(document.textures, resources.textureIndices),
    samplers: indexed(document.samplers, resources.samplerIndices),
    images: embeddedImages(document, bin, resources.imageIndices)
  };
  return sha256(canonicalBytes(payload));
}
```

- [ ] **Step 3.14: Implement the semantic validator and exact report**

Append:

```js
export function validateYueELookdev(document, bin, contract, buildReport) {
  validateEmbeddedImageDimensions(document, bin);
  const nodes = document.nodes ?? [];
  const nodeNames = new Map(nodes.map((node, index) => [node.name, index]));
  const world = worldMatrices(document);
  const boneParents = {};
  for (const bone of contract.REQUIRED_BONES) {
    const index = nodeNames.get(bone);
    assert.notEqual(index, undefined, `BONE_MISSING_${bone}`);
    const parentIndex = world.parents[index];
    boneParents[bone] = parentIndex < 0 ? null : nodes[parentIndex].name;
  }
  assert.deepEqual(boneParents, contract.REQUIRED_BONE_PARENTS);
  assert.equal(new Set(contract.REQUIRED_BONES.map((name) => nodeNames.get(name))).size, 39, "BONE_DUPLICATE");
  assert.equal(residualFromIdentity(localMatrix(nodes[nodeNames.get("Root")])) <= 1e-6, true, "ROOT_JOINT_NOT_IDENTITY");
  assert.deepEqual(document.extensionsRequired ?? [], [], "GLTF_REQUIRED_EXTENSIONS");

  let bindPoseMaxResidual = 0;
  let skinCount = 0;
  let unweightedVertexCount = 0;
  let maxInfluencesPerVertex = 0;
  let triangles = 0;
  const rigPrimitives = [];
  const materialNames = new Set();
  const lod0SemanticIds = [];
  const allPoints = [];
  const bodyPoints = [];
  const boneWeightTotals = new Map();
  let totalSkinWeight = 0;
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    const node = nodes[nodeIndex];
    if (node.mesh === undefined) continue;
    assert.equal(Number.isFinite(determinant3(world.matrices[nodeIndex])) && Math.abs(determinant3(world.matrices[nodeIndex])) > 1e-8, true, "NODE_TRANSFORM_DEGENERATE");
    assert.equal(node.extras?.yueELod, 0, "LOD0_TAG");
    assert.equal(typeof node.extras?.yueESemanticId, "string", "SEMANTIC_ID");
    assert.equal(node.extras.yueESemanticId.startsWith(contract.YUE_E_LOOKDEV.semanticIdPrefix), true, "SEMANTIC_PREFIX");
    assert.equal(["body", "wing", "tool"].includes(node.extras?.yueERegion), true, "REGION_TAG");
    lod0SemanticIds.push(node.extras.yueESemanticId);
    assert.notEqual(node.skin, undefined, "VISIBLE_MESH_UNBOUND");
    const skin = document.skins?.[node.skin];
    assert.ok(skin, "SKIN_INDEX");
    skinCount += 1;
    const inverseBind = readAccessor(document, bin, skin.inverseBindMatrices);
    assert.deepEqual(inverseBind.meta, { componentType: 5126, type: "MAT4", count: skin.joints.length, normalized: false });
    const palette = skin.joints.map((joint, index) => multiply(multiply(inverse(world.matrices[nodeIndex]), world.matrices[joint]), inverseBind.values[index]));
    bindPoseMaxResidual = Math.max(bindPoseMaxResidual, ...palette.map(residualFromIdentity));
    for (const primitive of document.meshes[node.mesh].primitives) {
      assert.equal(primitive.mode ?? 4, 4, "PRIMITIVE_MODE");
      assert.notEqual(primitive.attributes.JOINTS_0, undefined, "JOINTS_0");
      assert.notEqual(primitive.attributes.WEIGHTS_0, undefined, "WEIGHTS_0");
      assert.equal(primitive.attributes.JOINTS_1, undefined, "JOINTS_1_FORBIDDEN");
      assert.equal(primitive.attributes.WEIGHTS_1, undefined, "WEIGHTS_1_FORBIDDEN");
      const positions = readAccessor(document, bin, primitive.attributes.POSITION);
      const joints = readAccessor(document, bin, primitive.attributes.JOINTS_0);
      const weights = readAccessor(document, bin, primitive.attributes.WEIGHTS_0);
      assert.equal(positions.meta.count, joints.meta.count);
      assert.equal(positions.meta.count, weights.meta.count);
      const transformedPositions = positions.values.map((position) => transformPoint(world.matrices[nodeIndex], position));
      allPoints.push(...transformedPositions);
      if (node.extras.yueERegion === "body") bodyPoints.push(...transformedPositions);
      for (let vertex = 0; vertex < weights.values.length; vertex += 1) {
        const active = weights.values[vertex].filter((weight) => weight > 1e-6);
        if (active.length === 0) unweightedVertexCount += 1;
        maxInfluencesPerVertex = Math.max(maxInfluencesPerVertex, active.length);
        assert.equal(Math.abs(active.reduce((sum, weight) => sum + weight, 0) - 1) <= 1e-4, true, "WEIGHT_SUM");
        assert.equal(joints.values[vertex].every((joint) => Number.isInteger(joint) && joint >= 0 && joint < skin.joints.length), true, "JOINT_RANGE");
        for (let lane = 0; lane < weights.values[vertex].length; lane += 1) {
          const weight = weights.values[vertex][lane];
          if (weight <= 1e-6) continue;
          const boneName = nodes[skin.joints[joints.values[vertex][lane]]].name;
          boneWeightTotals.set(boneName, (boneWeightTotals.get(boneName) ?? 0) + weight);
          totalSkinWeight += weight;
        }
      }
      const indexCount = primitive.indices === undefined ? positions.meta.count : readAccessor(document, bin, primitive.indices).meta.count;
      assert.equal(indexCount % 3, 0, "TRIANGLE_INDEX_COUNT");
      triangles += indexCount / 3;
      const material = document.materials?.[primitive.material];
      assert.ok(material && contract.REQUIRED_MATERIALS.includes(material.name), "MATERIAL_SLOT");
      materialNames.add(material.name);
      rigPrimitives.push({ semanticId: node.extras.yueESemanticId, positions, joints, weights, inverseBind: inverseBind.values });
    }
  }
  assert.equal(new Set(lod0SemanticIds).size, lod0SemanticIds.length, "SEMANTIC_DUPLICATE");
  assert.equal(bindPoseMaxResidual <= 1e-4, true, "BIND_POSE_RESIDUAL");
  assert.equal(unweightedVertexCount, 0, "UNWEIGHTED_VERTEX");
  assert.equal(maxInfluencesPerVertex <= 4, true, "INFLUENCE_LIMIT");
  const maximumBoneOwnership = Math.max(...boneWeightTotals.values()) / totalSkinWeight;
  assert.equal(maximumBoneOwnership <= .45, true, "BONE_OWNERSHIP");
  assert.equal(triangles >= 35_000 && triangles <= 60_000, true, "TRIANGLE_RANGE");
  assert.deepEqual(document.animations ?? [], [], "ANIMATIONS_FORBIDDEN");

  const bounds = (points) => ({
    min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]))),
    max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis])))
  });
  assert.equal(allPoints.length > 0 && bodyPoints.length > 0, true, "POSITION_SET_EMPTY");
  const fullBounds = bounds(allPoints);
  const bodyBounds = bounds(bodyPoints);
  const heightMeters = fullBounds.max[1] - fullBounds.min[1];
  const bodyMaxRadialDistance = Math.max(...bodyPoints.map(([x, , z]) => Math.hypot(x, z)));
  const footLeft = transformPoint(world.matrices[nodeNames.get("Foot_L")], [0, 0, 0]);
  const footRight = transformPoint(world.matrices[nodeNames.get("Foot_R")], [0, 0, 0]);
  const feetMidpoint = footLeft.map((value, axis) => (value + footRight[axis]) * .5);
  const feetMidpointDistanceFromOrigin = Math.hypot(feetMidpoint[0], feetMidpoint[2]);
  const forwardNodes = nodes.map((node, index) => ({ node, index })).filter(({ node }) => node.extras?.yueEForward === true);
  assert.equal(forwardNodes.length, 1, "FORWARD_MARKER_COUNT");
  const forwardPoint = transformPoint(world.matrices[forwardNodes[0].index], [0, 0, 0]);
  const forwardMarkerAxis = Math.abs(forwardPoint[0]) <= .005 && forwardPoint[2] < -.005 ? "-Z" : "INVALID";
  for (const axis of [0, 1, 2]) {
    assert.equal(bodyBounds.min[axis] >= fullBounds.min[axis] - 1e-6, true, `BODY_CONTAINMENT_MIN_${axis}`);
    assert.equal(bodyBounds.max[axis] <= fullBounds.max[axis] + 1e-6, true, `BODY_CONTAINMENT_MAX_${axis}`);
  }

  const probes = exportedPoseProbes(document, bin, contract.POSE_PROBES, nodeNames);
  assert.equal(probes.every(({ passed }) => passed), true, "EXPORTED_POSE_PROBE");
  const report = {
    ...buildReport,
    triangles, heightMeters, bodyBounds, bodyMaxRadialDistance,
    feetMidpointDistanceFromOrigin, forwardMarkerAxis,
    skinCount,
    visibleSkinnedMeshCount: lod0SemanticIds.length,
    bones: [...contract.REQUIRED_BONES], boneParents,
    bindPoseMaxResidual, exportedPoseProbes: probes,
    unweightedVertexCount, maxInfluencesPerVertex, maximumBoneOwnership,
    wingJointCount: contract.REQUIRED_BONES.filter((name) => /^Wing\d\d_[LR]$/.test(name)).length,
    materialNames: [...materialNames].sort(), lod0SemanticIds: [...lod0SemanticIds].sort(),
    nodeWorldMatrices: world.matrices,
    externalUriCount: (document.buffers ?? []).filter((buffer) => buffer.uri).length + (document.images ?? []).filter((image) => image.uri).length,
    animations: document.animations ?? [],
    rigFingerprintInput: {
      version: 1, bones: contract.REQUIRED_BONES, boneParents,
      restWorldMatrices: contract.REQUIRED_BONES.map((name) => world.matrices[nodeNames.get(name)]),
      primitives: rigPrimitives, bindPoseMaxResidual, exportedPoseProbes: probes
    }
  };
  report.rigFingerprintSha256 = canonicalRigFingerprint(report);
  report.approvedLod0VisualFingerprintSha256 = canonicalApprovedLod0VisualFingerprint(document, bin, report);
  for (const axis of [0, 1, 2]) {
    assert.equal(Math.abs(report.bodyBounds.min[axis] - buildReport.bodyBounds.min[axis]) <= .001, true, `BODY_MIN_${axis}`);
    assert.equal(Math.abs(report.bodyBounds.max[axis] - buildReport.bodyBounds.max[axis]) <= .001, true, `BODY_MAX_${axis}`);
  }
  assert.equal(Math.abs(report.bodyMaxRadialDistance - buildReport.bodyMaxRadialDistance) <= .001, true, "BODY_RADIAL");
  assert.equal(Math.abs(report.bodyBounds.min[1]) <= .005, true, "BODY_FLOOR");
  assert.equal(report.feetMidpointDistanceFromOrigin <= .01, true, "FOOT_ORIGIN");
  assert.equal(report.forwardMarkerAxis, "-Z", "FORWARD_AXIS");
  return report;
}
```

- [ ] **Step 3.15: Add fingerprint mutation tests before writing a gate**

Add `fingerprintCase` to `scripts/check-yue-e-glb-parser.mjs` and register it:

```js
async function fingerprintCase() {
  const { canonicalApprovedLod0VisualFingerprint, canonicalRigFingerprint } = await import("./yue-e/lib/yue-e-lookdev-gate.mjs");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const base = {
    nodes: [{ mesh: 0, extras: { yueELod: 0, yueERegion: "body", yueESemanticId: "yue-e.lod0.fixture" } }],
    meshes: [{ primitives: [{ mode: 4, material: 0, attributes: { POSITION: 0, NORMAL: 1 } }] }],
    materials: [{ name: "YE_Visor", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: 0 }, roughnessFactor: .34, metallicFactor: .04 } }],
    textures: [{ sampler: 0, source: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    images: [{ name: "one-pixel", mimeType: "image/png", bufferView: 2 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 12 },
      { buffer: 0, byteOffset: 12, byteLength: 12 },
      { buffer: 0, byteOffset: 24, byteLength: png.length }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 1, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 1, type: "VEC3" }
    ]
  };
  const geometry = Buffer.alloc(24); geometry.writeFloatLE(1, 8); geometry.writeFloatLE(1, 20);
  const bin = Buffer.concat([geometry, png]);
  const rigReport = { rigFingerprintInput: { fixture: "stable-rig" } };
  const rigFingerprintSha256 = canonicalRigFingerprint(rigReport);
  const report = { rigFingerprintSha256, nodeWorldMatrices: [[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]] };
  const original = canonicalApprovedLod0VisualFingerprint(base, bin, report);
  const normalChanged = Buffer.from(bin); normalChanged.writeFloatLE(.5, 20);
  assert.notEqual(canonicalApprovedLod0VisualFingerprint(base, normalChanged, report), original);
  const materialChanged = structuredClone(base); materialChanged.materials[0].pbrMetallicRoughness.roughnessFactor = .5;
  assert.notEqual(canonicalApprovedLod0VisualFingerprint(materialChanged, bin, report), original);
  const imageChanged = Buffer.from(bin); imageChanged[24] ^= 1;
  assert.notEqual(canonicalApprovedLod0VisualFingerprint(base, imageChanged, report), original);
  assert.equal(canonicalRigFingerprint(rigReport), rigFingerprintSha256);
  const animationOnly = structuredClone(base); animationOnly.animations = [{ name: "future", channels: [], samplers: [] }];
  assert.equal(canonicalApprovedLod0VisualFingerprint(animationOnly, bin, report), original);
}
```

- [ ] **Step 3.16: Run parser/fingerprint and real semantic checks GREEN**

Run:

```powershell
node scripts/check-yue-e-glb-parser.mjs
node scripts/check-yue-e-character-asset.mjs --stage=lookdev
```

Expected: both exit 0; parser lists `container/accessors/fingerprints`; asset JSON includes 39 bones, 12 wing joints, 10 materials, 0 animations and two uppercase 64-character fingerprints.

- [ ] **Step 3.17: Commit the validator before adding serialization**

Run:

```powershell
git add scripts/yue-e/lib/yue-e-lookdev-gate.mjs scripts/check-yue-e-glb-parser.mjs scripts/check-yue-e-character-asset.mjs
git diff --cached --check
git commit -m "test: validate Yue E exported skin and appearance"
```

- [ ] **Step 3.18: Write failing pending-gate serialization assertions**

Add `--case=gate` handling to `scripts/check-yue-e-character-asset.mjs` by invoking `--write-gate`, then read the output and assert:

```js
const gatePath = path.join(root, contract.LOOKDEV_GATE_PATH);
const gate = JSON.parse(await readFile(gatePath, "utf8"));
assert.equal(gate.version, 1);
assert.equal(gate.stage, "lookdev");
assert.equal(gate.anchors.length, 3);
assert.match(gate.lookdevContractSha256, /^[A-F0-9]{64}$/);
assert.match(gate.buildReportSha256, /^[A-F0-9]{64}$/);
assert.equal(gate.rigFingerprintSha256, report.rigFingerprintSha256);
assert.equal(gate.approvedLod0VisualFingerprintSha256, report.approvedLod0VisualFingerprintSha256);
assert.deepEqual(gate.approval, { status: "pending", approvedModelSha256: null, approvedAt: null });
```

- [ ] **Step 3.19: Run pending-gate serialization RED**

Run:

```powershell
node scripts/check-yue-e-character-asset.mjs --stage=lookdev --write-gate
```

Expected: exit non-zero because `writePendingGate` is not exported.

- [ ] **Step 3.20: Implement pending gate creation and full recomputation**

Append to `yue-e-lookdev-gate.mjs`:

```js
function inside(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, candidate);
  assert.equal(resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`), true, "PATH_OUTSIDE_ROOT");
  return resolved;
}

function gateMetrics(report) {
  return {
    bodyBounds: report.bodyBounds, bodyMaxRadialDistance: report.bodyMaxRadialDistance,
    feetMidpointDistanceFromOrigin: report.feetMidpointDistanceFromOrigin,
    forwardMarkerAxis: report.forwardMarkerAxis,
    lod0SemanticIds: report.lod0SemanticIds, bindPoseMaxResidual: report.bindPoseMaxResidual,
    exportedPoseProbes: report.exportedPoseProbes, triangles: report.triangles,
    heightMeters: report.heightMeters, boneCount: report.bones.length,
    wingJointCount: report.wingJointCount, materialNames: report.materialNames
  };
}

export async function writePendingGate({ root, contractPath, candidatePath, buildPath, contract, report }) {
  const candidate = await readFile(candidatePath);
  const contractBytes = await readFile(contractPath);
  const buildBytes = await readFile(buildPath);
  const anchors = [];
  for (const anchor of contract.APPROVED_ANCHORS) {
    const bytes = await readFile(inside(root, anchor.path));
    assert.equal(sha256(bytes), anchor.sha256, "ANCHOR_HASH");
    anchors.push({ ...anchor });
  }
  const gate = {
    version: 1, stage: "lookdev", anchors,
    lookdevContractSha256: sha256(contractBytes),
    buildReportSha256: sha256(buildBytes),
    rigFingerprintSha256: report.rigFingerprintSha256,
    approvedLod0VisualFingerprintSha256: report.approvedLod0VisualFingerprintSha256,
    model: {
      path: path.relative(root, candidatePath).replaceAll(path.sep, "/"),
      sha256: sha256(candidate),
      metrics: gateMetrics(report)
    },
    build: { blenderVersion: "5.1.2", blenderBuildHash: "ec6e62d40fa9" },
    approval: { status: "pending", approvedModelSha256: null, approvedAt: null },
    generatedAt: new Date().toISOString()
  };
  const gatePath = inside(root, contract.LOOKDEV_GATE_PATH);
  await writeFile(gatePath, `${JSON.stringify(gate, null, 2)}\n`, { flag: "w" });
  return gate;
}
```

Append the full verifier; it reopens and revalidates every approved byte instead of trusting serialized metrics:

```js
export async function verifyLookdevGate({ root, gate: gateRelative, candidate: candidateRelative, contract: contractRelative, requireStatus }) {
  assert.ok(new Set(["pending", "approved"]).has(requireStatus), "GATE_REQUIRED_STATUS");
  for (const value of [gateRelative, candidateRelative, contractRelative]) {
    assert.equal(path.isAbsolute(value), false, "GATE_PATH_MUST_BE_RELATIVE");
  }
  const gatePath = inside(root, gateRelative);
  const candidatePath = inside(root, candidateRelative);
  const contractPath = inside(root, contractRelative);
  const [gateBytes, candidateBytes, contractBytes] = await Promise.all([
    readFile(gatePath), readFile(candidatePath), readFile(contractPath)
  ]);
  const gate = JSON.parse(gateBytes);
  const contractHash = sha256(contractBytes);
  const contract = await import(`${pathToFileURL(contractPath).href}?sha256=${contractHash}`);
  assert.equal(contract.LOOKDEV_GATE_PATH, gateRelative.replaceAll("\\", "/"), "GATE_CONTRACT_PATH");
  assert.equal(contract.LOOKDEV_CANDIDATE_PATH, candidateRelative.replaceAll("\\", "/"), "MODEL_CONTRACT_PATH");
  const buildPath = inside(root, contract.LOOKDEV_BUILD_REPORT_PATH);
  const buildBytes = await readFile(buildPath);
  const buildReport = JSON.parse(buildBytes);
  const parsed = readGlbV2(candidateBytes);
  const report = validateYueELookdev(parsed.json, parsed.bin, contract, buildReport);

  assert.equal(gate.version, 1, "GATE_VERSION");
  assert.equal(gate.stage, "lookdev", "GATE_STAGE");
  assert.equal(gate.model.path, candidateRelative.replaceAll("\\", "/"), "GATE_MODEL_PATH");
  assert.equal(gate.model.sha256, sha256(candidateBytes), "GATE_MODEL_HASH");
  assert.equal(gate.lookdevContractSha256, contractHash, "GATE_CONTRACT_HASH");
  assert.equal(gate.buildReportSha256, sha256(buildBytes), "GATE_BUILD_HASH");
  assert.deepEqual(gate.model.metrics, gateMetrics(report), "GATE_METRICS");
  assert.equal(gate.rigFingerprintSha256, report.rigFingerprintSha256, "GATE_RIG_HASH");
  assert.equal(gate.approvedLod0VisualFingerprintSha256, report.approvedLod0VisualFingerprintSha256, "GATE_VISUAL_HASH");
  assert.deepEqual(gate.build, { blenderVersion: "5.1.2", blenderBuildHash: "ec6e62d40fa9" }, "GATE_BUILD_IDENTITY");
  assert.deepEqual(gate.anchors, contract.APPROVED_ANCHORS, "GATE_ANCHOR_MANIFEST");
  for (const anchor of gate.anchors) {
    const anchorBytes = await readFile(inside(root, anchor.path));
    assert.equal(sha256(anchorBytes), anchor.sha256, `GATE_ANCHOR_HASH_${anchor.path}`);
  }
  assert.equal(Number.isFinite(Date.parse(gate.generatedAt)), true, "GATE_GENERATED_AT");
  assert.equal(gate.approval.status, requireStatus, "GATE_STATUS");
  if (requireStatus === "pending") {
    assert.deepEqual(gate.approval, { status: "pending", approvedModelSha256: null, approvedAt: null }, "GATE_PENDING_FIELDS");
  } else {
    assert.equal(gate.approval.approvedModelSha256, gate.model.sha256, "GATE_APPROVED_MODEL_HASH");
    assert.equal(Number.isFinite(Date.parse(gate.approval.approvedAt)), true, "GATE_APPROVED_AT");
  }
  return { gate, report };
}
```

- [ ] **Step 3.21: Generate and validate the pending gate GREEN**

Run:

```powershell
node scripts/check-yue-e-character-asset.mjs --stage=lookdev --write-gate
node scripts/check-yue-e-character-asset.mjs --stage=lookdev
```

Expected: both exit 0; the gate status is `pending`; exact candidate SHA, build/contract/anchor hashes, rig fingerprint and approved LOD0 visual fingerprint are present.

- [ ] **Step 3.22: Commit the parser, validator and pending gate**

Run:

```powershell
git add scripts/yue-e/lib/glb-v2.mjs scripts/yue-e/lib/yue-e-lookdev-gate.mjs scripts/check-yue-e-glb-parser.mjs scripts/check-yue-e-character-asset.mjs docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json
git diff --cached --check
git commit -m "test: lock Yue E lookdev gate fingerprints"
```

Expected: approval remains pending and no runtime asset is staged.

---

## Task 4: Prove the candidate in real Three.js r128 and stop at USER GATE A

**Files:**

- Create: docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.html
- Create: docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.css
- Create: docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.js
- Create: scripts/yue-e/lib/edge-cdp.mjs
- Create: scripts/check-yue-e-lookdev-browser.mjs
- Create: scripts/check-yue-e-approval-gate.mjs
- Create: scripts/yue-e/approve-traveler-lookdev.mjs
- Generate: artifacts/yue-e/phase-1/lookdev-000.png through lookdev-315.png

**Interfaces:**

- The page loads only /web/vendor/three.r128.min.js and /web/vendor/GLTFLoader.r128.js, verifies bytes before parsing, keeps authored scale 1, and never auto-fits the model.
- The only public page surface is Object.freeze({ setAngle, sampleFrame, snapshot, dispose }); no renderer, scene, camera, model, skeleton or mutation hook is exposed.
- The normal browser checker starts its own server and Edge, writes eight screenshots, closes both and exits. --serve --port=0 starts only the static review server, prints its URL and remains alive until Ctrl+C.
- approve-traveler-lookdev.mjs requires an exact uppercase candidate SHA and changes only approval.status, approval.approvedModelSha256 and approval.approvedAt.

- [ ] **Step 4.1: Add the failing review-file boundary check (2–3 minutes)**

Create scripts/check-yue-e-lookdev-browser.mjs:

~~~~js
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
for (const relative of [
  "docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.html",
  "docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.css",
  "docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.js",
  "scripts/yue-e/lib/edge-cdp.mjs"
]) {
  assert.equal(existsSync(path.join(root, relative)), true, relative);
}
~~~~

- [ ] **Step 4.2: Run the review boundary RED (2 minutes)**

Run:

~~~~powershell
node scripts/check-yue-e-lookdev-browser.mjs
~~~~

Expected: exit non-zero and name lookdev-review.html as missing.

- [ ] **Step 4.3: Create the semantic review page (3–5 minutes)**

Create docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.html:

~~~~html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>遇E Traveler — Gate A</title>
  <link rel="stylesheet" href="./lookdev-review.css">
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">PHASE 1A · USER GATE A</p>
      <h1>遇E Traveler / 外观与骨骼</h1>
      <p id="status" role="status">正在验证候选字节…</p>
    </header>
    <section class="stage" aria-label="三维转台">
      <canvas id="review-canvas" width="1280" height="960"></canvas>
      <div class="angle-strip" aria-label="固定转台角度">
        <button type="button" data-angle="0">000°</button>
        <button type="button" data-angle="45">045°</button>
        <button type="button" data-angle="90">090°</button>
        <button type="button" data-angle="135">135°</button>
        <button type="button" data-angle="180">180°</button>
        <button type="button" data-angle="225">225°</button>
        <button type="button" data-angle="270">270°</button>
        <button type="button" data-angle="315">315°</button>
      </div>
    </section>
    <aside class="reference-rail" aria-label="批准概念锚点">
      <figure><img src="/docs/superpowers/assets/yue-e/e-traveler-approved.png" width="1536" height="1024" alt="批准的旅人概念锚点"><figcaption>外观锚点</figcaption></figure>
      <figure><img src="/docs/superpowers/assets/yue-e/e-traveler-actions-approved.png" width="1774" height="887" alt="批准的动作概念锚点"><figcaption>动作语义锚点</figcaption></figure>
      <figure><img src="/docs/superpowers/assets/yue-e/camera-views-approved.png" width="1817" height="866" alt="批准的机位概念锚点"><figcaption>机位锚点</figcaption></figure>
    </aside>
    <section class="questions" aria-labelledby="questions-title">
      <h2 id="questions-title">Gate A 检查</h2>
      <ol>
        <li>轮廓是否是约 4.5 头身、斗篷式上衣、短裤和奶油靴？</li>
        <li>深色面罩、双发光短线、暖黄胸核、珊瑚边和米白主体是否成立？</li>
        <li>十二片翅板和右腕重力工具是否清楚、没有平面替身感？</li>
        <li>八个角度下体积、材质、背面和侧面是否都可接受？</li>
        <li>五个骨骼 probe 是否是局部形变，且对照肢体没有漂移？</li>
      </ol>
    </section>
  </main>
  <script src="/web/vendor/three.r128.min.js"></script>
  <script src="/web/vendor/GLTFLoader.r128.js"></script>
  <script type="module" src="./lookdev-review.js"></script>
</body>
</html>
~~~~

- [ ] **Step 4.4: Add the deterministic review layout (2–4 minutes)**

Create docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.css:

~~~~css
:root { color-scheme: dark; font-family: Inter, "Segoe UI", sans-serif; background: #101319; color: #f4efe6; }
* { box-sizing: border-box; }
body { margin: 0; background: radial-gradient(circle at 35% 15%, #27313d 0, #101319 48rem); }
main { width: min(1500px, calc(100% - 32px)); margin: 0 auto; padding: 36px 0 64px; display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 24px; }
header, .questions { grid-column: 1 / -1; }
.eyebrow { margin: 0 0 8px; color: #54d8d0; letter-spacing: .18em; font-size: 12px; }
h1 { margin: 0; font-size: clamp(32px, 5vw, 66px); font-weight: 560; }
#status { color: #b9c3cc; }
.stage { min-width: 0; }
#review-canvas { display: block; width: 100%; aspect-ratio: 4 / 3; border: 1px solid #394450; background: #151b22; }
.angle-strip { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; margin-top: 10px; }
button { border: 1px solid #465361; background: #1b222b; color: #dfe7e7; padding: 9px 4px; cursor: pointer; }
button[aria-pressed="true"], button:hover { border-color: #54d8d0; color: #54d8d0; }
.reference-rail { display: grid; align-content: start; gap: 12px; }
figure { margin: 0; border: 1px solid #394450; background: #171c23; padding: 8px; }
figure img { width: 100%; height: auto; display: block; }
figcaption { padding-top: 7px; color: #aab4be; font-size: 12px; }
.questions { border-top: 1px solid #394450; padding-top: 20px; }
.questions li { margin: 7px 0; color: #c8d0d6; }
@media (max-width: 900px) { main { grid-template-columns: 1fr; } .reference-rail { grid-template-columns: repeat(3, 1fr); } .angle-strip { grid-template-columns: repeat(4, 1fr); } }
~~~~

- [ ] **Step 4.5: Implement hash-first r128 loading and fixed authored framing (4–5 minutes)**

Create docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.js with this first block:

~~~~js
import {
  APPROVED_ANCHORS, POSE_PROBES, REQUIRED_BONES, REQUIRED_MATERIALS,
  YUE_E_LOOKDEV
} from "/web/yue-e/character/lookdev-contract.js";

const THREE = window.THREE;
if (!THREE || THREE.REVISION !== "128" || typeof THREE.GLTFLoader !== "function") {
  throw new Error("YUE_E_THREE_R128_REQUIRED");
}

const canvas = document.querySelector("#review-canvas");
const status = document.querySelector("#status");
const state = {
  ready: false, disposed: false, contextLost: false, angle: 0,
  modelSha256: null, gateStatus: null, semanticIds: [], boneNames: [],
  materialNames: [], animationNames: [], anchorChecks: [], poseProbes: [],
  lastFrame: null, error: null
};
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(1280, 960, false);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x151b22, 1);
canvas.addEventListener("webglcontextlost", (event) => { event.preventDefault(); state.contextLost = true; });

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151b22);
const modelRoot = new THREE.Group();
modelRoot.name = "YE_ReviewRoot";
modelRoot.scale.setScalar(1);
modelRoot.position.set(0, 0, 0);
scene.add(modelRoot);
const camera = new THREE.OrthographicCamera(-.9, .9, .675, -.675, .01, 20);
camera.position.set(0, .70, -3);
camera.lookAt(0, .70, 0);
camera.updateProjectionMatrix();
scene.add(new THREE.HemisphereLight(0xdcefff, 0x352b34, 1.25));
const key = new THREE.DirectionalLight(0xffe6cb, 2.1);
key.position.set(-2.5, 4, -3); key.castShadow = true; scene.add(key);
const rim = new THREE.DirectionalLight(0x78dcd8, 1.15);
rim.position.set(3, 2.5, 2.5); scene.add(rim);
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(1.25, 96),
  new THREE.MeshStandardMaterial({ color: 0x202832, roughness: 1, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const toHex = (bytes) => Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
async function fetchVerified(url, expectedSha256) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("YUE_E_FETCH_" + response.status + "_" + url);
  const buffer = await response.arrayBuffer();
  const actual = toHex(await crypto.subtle.digest("SHA-256", buffer));
  if (actual !== expectedSha256) throw new Error("YUE_E_HASH_" + url);
  return buffer;
}

async function verifyAnchors() {
  const checks = [];
  for (const anchor of APPROVED_ANCHORS) {
    const bytes = await fetchVerified("/" + anchor.path, anchor.sha256);
    const image = document.querySelector('img[src="/' + anchor.path + '"]');
    await image.decode();
    if (image.naturalWidth !== anchor.width || image.naturalHeight !== anchor.height) throw new Error("YUE_E_ANCHOR_DIMENSIONS");
    checks.push({ path: anchor.path, sha256: anchor.sha256, byteLength: bytes.byteLength, width: image.naturalWidth, height: image.naturalHeight });
  }
  state.anchorChecks = checks;
}

async function loadCandidate() {
  const gateResponse = await fetch("../yue-e-traveler-gate.json", { cache: "no-store" });
  if (!gateResponse.ok) throw new Error("YUE_E_GATE_FETCH");
  const gate = await gateResponse.json();
  if (!["pending", "approved"].includes(gate.approval.status)) throw new Error("YUE_E_GATE_STATUS");
  const data = await fetchVerified("../yue-e-traveler-lookdev.glb", gate.model.sha256);
  const gltf = await new Promise((resolve, reject) => {
    new THREE.GLTFLoader().parse(data.slice(0), "../", resolve, reject);
  });
  if (gltf.animations.length !== 0) throw new Error("YUE_E_LOOKDEV_ANIMATIONS");
  modelRoot.add(gltf.scene);
  gltf.scene.updateMatrixWorld(true);
  const semanticIds = [];
  const boneNames = new Set();
  const materialNames = new Set();
  gltf.scene.traverse((object) => {
    if (object.isMesh) {
      if (object.userData.yueELod !== 0) throw new Error("YUE_E_LOD0_TAG");
      if (!String(object.userData.yueESemanticId || "").startsWith(YUE_E_LOOKDEV.semanticIdPrefix)) throw new Error("YUE_E_SEMANTIC_ID");
      semanticIds.push(object.userData.yueESemanticId);
      object.castShadow = true; object.receiveShadow = true; object.frustumCulled = false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) materialNames.add(material.name);
    }
    if (object.isBone) boneNames.add(object.name);
  });
  if (new Set(semanticIds).size !== semanticIds.length) throw new Error("YUE_E_SEMANTIC_DUPLICATE");
  if (REQUIRED_BONES.some((name) => !boneNames.has(name))) throw new Error("YUE_E_BONE_MISSING");
  if (REQUIRED_MATERIALS.some((name) => !materialNames.has(name))) throw new Error("YUE_E_MATERIAL_MISSING");
  state.modelSha256 = gate.model.sha256;
  state.gateStatus = gate.approval.status;
  state.semanticIds = semanticIds.sort();
  state.boneNames = [...boneNames].sort();
  state.materialNames = [...materialNames].sort();
  state.animationNames = gltf.animations.map((clip) => clip.name);
}
~~~~

- [ ] **Step 4.6: Add the real Three r128 deformation and mask probes (4–5 minutes)**

Append to lookdev-review.js:

~~~~js
const maskTarget = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: true, stencilBuffer: false });
const maskMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
function maskBytes() {
  const previousTarget = renderer.getRenderTarget();
  const previousOverride = scene.overrideMaterial;
  const previousColor = renderer.getClearColor(new THREE.Color()).clone();
  const previousAlpha = renderer.getClearAlpha();
  scene.overrideMaterial = maskMaterial;
  renderer.setRenderTarget(maskTarget);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  const pixels = new Uint8Array(512 * 512 * 4);
  renderer.readRenderTargetPixels(maskTarget, 0, 0, 512, 512, pixels);
  renderer.setRenderTarget(previousTarget);
  renderer.setClearColor(previousColor, previousAlpha);
  scene.overrideMaterial = previousOverride;
  return pixels;
}

function changedMaskPixels(before, after) {
  let changed = 0;
  for (let offset = 3; offset < before.length; offset += 4) {
    if ((before[offset] > 0) !== (after[offset] > 0)) changed += 1;
  }
  return changed;
}

function weightAt(attribute, vertex, lane) {
  return [attribute.getX(vertex), attribute.getY(vertex), attribute.getZ(vertex), attribute.getW(vertex)][lane];
}

function eligibleVertices(probe) {
  const target = [];
  const control = [];
  modelRoot.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const targetJoint = mesh.skeleton.bones.findIndex((bone) => bone.name === probe.bone);
    const controlJoint = mesh.skeleton.bones.findIndex((bone) => bone.name === probe.controlBone);
    const joints = mesh.geometry.getAttribute("skinIndex");
    const weights = mesh.geometry.getAttribute("skinWeight");
    const positions = mesh.geometry.getAttribute("position");
    if (!joints || !weights || !positions) throw new Error("YUE_E_R128_SKIN_ATTRIBUTES");
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      let targetWeight = 0;
      let controlWeight = 0;
      for (let lane = 0; lane < 4; lane += 1) {
        const joint = weightAt(joints, vertex, lane);
        const weight = weightAt(weights, vertex, lane);
        if (joint === targetJoint) targetWeight += weight;
        if (joint === controlJoint) controlWeight += weight;
      }
      if (targetWeight >= .25) target.push({ mesh, vertex });
      if (controlWeight >= .50) control.push({ mesh, vertex });
    }
  });
  return { target, control };
}

function skinnedWorldPoint(entry) {
  const local = entry.mesh.boneTransform(entry.vertex, new THREE.Vector3());
  return entry.mesh.localToWorld(local);
}

function capturePoints(entries) {
  return entries.map((entry) => skinnedWorldPoint(entry).clone());
}

function maximumDelta(before, entries) {
  let maximum = 0;
  for (let index = 0; index < entries.length; index += 1) {
    maximum = Math.max(maximum, before[index].distanceTo(skinnedWorldPoint(entries[index])));
  }
  return maximum;
}

function runR128PoseProbe(probe) {
  const bone = modelRoot.getObjectByName(probe.bone);
  if (!bone || !bone.isBone) throw new Error("YUE_E_R128_BONE_" + probe.bone);
  const vertices = eligibleVertices(probe);
  if (vertices.target.length === 0 || vertices.control.length === 0) throw new Error("YUE_E_R128_PROBE_VERTEX_SET");
  modelRoot.updateMatrixWorld(true);
  modelRoot.traverse((mesh) => { if (mesh.isSkinnedMesh) mesh.skeleton.update(); });
  const targetBefore = capturePoints(vertices.target);
  const controlBefore = capturePoints(vertices.control);
  const restMask = maskBytes();
  const original = bone.quaternion.clone();
  const axis = new THREE.Vector3(...probe.axis).normalize();
  bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(probe.angleDegrees)));
  modelRoot.updateMatrixWorld(true);
  modelRoot.traverse((mesh) => { if (mesh.isSkinnedMesh) mesh.skeleton.update(); });
  const maximumMovedMeters = maximumDelta(targetBefore, vertices.target);
  const maximumControlDriftMeters = maximumDelta(controlBefore, vertices.control);
  const posedMask = maskBytes();
  const maskDeltaPixels = changedMaskPixels(restMask, posedMask);
  const movedVertexCount = vertices.target.reduce((count, entry, index) => count + Number(targetBefore[index].distanceTo(skinnedWorldPoint(entry)) >= probe.minimumMovedMeters), 0);
  bone.quaternion.copy(original);
  modelRoot.updateMatrixWorld(true);
  modelRoot.traverse((mesh) => { if (mesh.isSkinnedMesh) mesh.skeleton.update(); });
  return {
    bone: probe.bone, movedVertexCount, maximumMovedMeters,
    controlVertexCount: vertices.control.length, maximumControlDriftMeters,
    maskDeltaPixels,
    passed: movedVertexCount > 0 &&
      maximumMovedMeters >= probe.minimumMovedMeters &&
      maximumControlDriftMeters <= probe.maximumControlDriftMeters &&
      maskDeltaPixels > 0
  };
}
~~~~

- [ ] **Step 4.7: Expose only the fixed facade and bootstrap it (3–5 minutes)**

Append to lookdev-review.js:

~~~~js
function render() {
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
}

function setAngle(degrees) {
  if (!Number.isFinite(degrees)) throw new TypeError("YUE_E_ANGLE");
  state.angle = ((degrees % 360) + 360) % 360;
  modelRoot.rotation.y = THREE.MathUtils.degToRad(state.angle);
  modelRoot.updateMatrixWorld(true);
  render();
  for (const button of document.querySelectorAll("[data-angle]")) {
    button.setAttribute("aria-pressed", String(Number(button.dataset.angle) === state.angle));
  }
}

async function sampleFrame() {
  if (!state.ready || state.disposed) throw new Error("YUE_E_REVIEW_NOT_READY");
  render();
  const gl = renderer.getContext();
  const rgba = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  let sum = 0;
  let squared = 0;
  const count = canvas.width * canvas.height;
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const luminance = (0.2126 * rgba[offset] + 0.7152 * rgba[offset + 1] + 0.0722 * rgba[offset + 2]) / 255;
    sum += luminance; squared += luminance * luminance;
  }
  const mask = maskBytes();
  let visible = 0;
  for (let offset = 3; offset < mask.length; offset += 4) visible += Number(mask[offset] > 0);
  const modelCoverage = visible / (mask.length / 4);
  state.lastFrame = Object.freeze({
    alphaCoverage: modelCoverage,
    luminanceVariance: squared / count - (sum / count) ** 2,
    modelCoverage
  });
  return state.lastFrame;
}

function snapshot() {
  return Object.freeze(JSON.parse(JSON.stringify({
    ready: state.ready, disposed: state.disposed, contextLost: state.contextLost,
    rendererRevision: THREE.REVISION, fixedAuthoredScale: modelRoot.scale.x,
    angle: state.angle, modelSha256: state.modelSha256, gateStatus: state.gateStatus,
    semanticIds: state.semanticIds, boneNames: state.boneNames,
    materialNames: state.materialNames, animationNames: state.animationNames,
    anchorChecks: state.anchorChecks, poseProbes: state.poseProbes,
    lastFrame: state.lastFrame, error: state.error
  })));
}

function dispose() {
  if (state.disposed) return;
  state.disposed = true;
  maskTarget.dispose(); maskMaterial.dispose(); renderer.dispose();
}

window.__yueELookdevReview = Object.freeze({ setAngle, sampleFrame, snapshot, dispose });
for (const button of document.querySelectorAll("[data-angle]")) {
  button.addEventListener("click", () => setAngle(Number(button.dataset.angle)));
}

async function bootstrap() {
  try {
    await verifyAnchors();
    await loadCandidate();
    state.poseProbes = POSE_PROBES.map(runR128PoseProbe);
    if (!state.poseProbes.every((probe) => probe.passed)) throw new Error("YUE_E_R128_POSE_PROBE");
    state.ready = true;
    setAngle(0);
    await sampleFrame();
    status.textContent = "字节、LOD0 语义、39 骨、五个 r128 probe 均通过；等待 Gate A 决策。";
  } catch (error) {
    state.error = String(error && error.stack || error);
    status.textContent = "验证失败：" + state.error;
    throw error;
  }
}
bootstrap();
~~~~

- [ ] **Step 4.8: Create the root-contained HTTP and raw-CDP fixture (4–5 minutes)**

Create scripts/yue-e/lib/edge-cdp.mjs:

~~~~js
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const MIME = new Map([
  [".html", "text/html; charset=utf-8"], [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".glb", "model/gltf-binary"],
  [".png", "image/png"]
]);

export async function startStaticServer(root, port = 0) {
  const absoluteRoot = path.resolve(root);
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const relative = pathname === "/" ? "docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.html" : pathname.slice(1);
      const file = path.resolve(absoluteRoot, relative);
      assert.equal(file === absoluteRoot || file.startsWith(absoluteRoot + path.sep), true, "HTTP_PATH_ESCAPE");
      const bytes = await readFile(file);
      response.writeHead(200, {
        "content-type": MIME.get(path.extname(file).toLowerCase()) || "application/octet-stream",
        "cache-control": "no-store", "x-content-type-options": "nosniff"
      });
      response.end(bytes);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  const origin = "http://127.0.0.1:" + address.port;
  return {
    origin,
    url: origin + "/docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.html",
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function edgeExecutable() {
  const candidates = [
    process.env.FE_EDGE_EXE,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean);
  const found = candidates.find((candidate) => {
    try { return requireExists(candidate); } catch { return false; }
  });
  assert.ok(found, "YUE_E_EDGE_NOT_FOUND");
  return found;
}

function requireExists(file) {
  readFile;
  return process.platform === "win32" && path.isAbsolute(file) &&
    Boolean(process.getBuiltinModule("fs").existsSync(file));
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function launchEdge(url) {
  const debugPort = await freePort();
  const profile = await mkdtemp(path.join(os.tmpdir(), "yue-e-edge-"));
  await writeFile(path.join(profile, "First Run"), "");
  const child = spawn(edgeExecutable(), [
    "--headless=new", "--no-first-run", "--disable-default-apps", "--disable-extensions",
    "--disable-background-networking", "--disable-component-update",
    "--remote-debugging-port=" + debugPort, "--user-data-dir=" + profile, "about:blank"
  ], { windowsHide: true, stdio: "ignore" });
  const base = "http://127.0.0.1:" + debugPort;
  let version;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { version = await (await fetch(base + "/json/version")).json(); break; } catch { await delay(50); }
  }
  assert.ok(version, "YUE_E_CDP_START_TIMEOUT");
  const target = await (await fetch(base + "/json/new?" + encodeURIComponent(url), { method: "PUT" })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const events = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const slot = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) slot.reject(new Error(message.error.message)); else slot.resolve(message.result);
    } else {
      events.push(message);
    }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await Promise.all([
    command("Page.enable"), command("Runtime.enable"), command("Network.enable"),
    command("Log.enable"), command("Inspector.enable"),
    command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 960, deviceScaleFactor: 1, mobile: false })
  ]);
  await command("Page.navigate", { url });
  const evaluate = async (expression) => {
    const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error("YUE_E_PAGE_EXCEPTION");
    return result.result.value;
  };
  const waitFor = async (expression, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw new Error("YUE_E_PAGE_READY_TIMEOUT");
  };
  const capture = async (file) => {
    const result = await command("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    await writeFile(file, Buffer.from(result.data, "base64"));
  };
  const close = async () => {
    try { await command("Browser.close"); } catch {}
    await delay(100);
    if (!child.killed) child.kill();
    socket.close();
    await rm(profile, { recursive: true, force: true });
  };
  return { evaluate, waitFor, capture, events, close };
}
~~~~

- [ ] **Step 4.9: Replace the boundary checker with the complete browser contract (4–5 minutes)**

Replace scripts/check-yue-e-lookdev-browser.mjs with:

~~~~js
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { startStaticServer, launchEdge } from "./yue-e/lib/edge-cdp.mjs";

const root = path.resolve(import.meta.dirname, "..");
const portText = process.argv.find((value) => value.startsWith("--port="))?.slice(7) || "0";
assert.match(portText, /^\d+$/, "YUE_E_PORT");
const fixture = await startStaticServer(root, Number(portText));

if (process.argv.includes("--serve")) {
  console.log(JSON.stringify({ ok: true, mode: "serve", url: fixture.url }));
  const stop = async () => { await fixture.close(); process.exit(0); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  await new Promise(() => {});
}

const screenshots = path.join(root, "artifacts/yue-e/phase-1");
await mkdir(screenshots, { recursive: true });
const browser = await launchEdge(fixture.url);
try {
  await browser.waitFor("Boolean(window.__yueELookdevReview && (window.__yueELookdevReview.snapshot().ready || window.__yueELookdevReview.snapshot().error))");
  const facadeKeys = await browser.evaluate("Object.keys(window.__yueELookdevReview).sort()");
  assert.deepEqual(facadeKeys, ["dispose", "sampleFrame", "setAngle", "snapshot"]);
  const initial = await browser.evaluate("window.__yueELookdevReview.snapshot()");
  assert.equal(initial.error, null, initial.error);
  assert.equal(initial.ready, true);
  assert.equal(initial.rendererRevision, "128");
  assert.equal(initial.fixedAuthoredScale, 1);
  assert.equal(initial.contextLost, false);
  assert.equal(initial.gateStatus, "pending");
  assert.equal(initial.semanticIds.length > 0, true);
  assert.equal(new Set(initial.semanticIds).size, initial.semanticIds.length);
  assert.equal(initial.semanticIds.every((id) => id.startsWith("yue-e.lod0.")), true);
  assert.equal(initial.boneNames.length, 39);
  assert.equal(initial.materialNames.length, 10);
  assert.deepEqual(initial.animationNames, []);
  assert.equal(initial.anchorChecks.length, 3);
  assert.equal(initial.poseProbes.length, 5);
  for (const probe of initial.poseProbes) {
    assert.equal(probe.passed, true, probe.bone);
    assert.equal(probe.movedVertexCount > 0, true, probe.bone);
    assert.equal(probe.maximumMovedMeters >= .002, true, probe.bone);
    assert.equal(probe.maximumControlDriftMeters <= .0005, true, probe.bone);
    assert.equal(probe.maskDeltaPixels > 0, true, probe.bone);
  }

  const first = await browser.evaluate("window.__yueELookdevReview.sampleFrame()");
  const second = await browser.evaluate("window.__yueELookdevReview.sampleFrame()");
  assert.equal(first.modelCoverage >= .20 && first.modelCoverage <= .70, true, "YUE_E_MODEL_COVERAGE");
  assert.equal(first.alphaCoverage >= .20 && first.alphaCoverage <= .70, true, "YUE_E_ALPHA_COVERAGE");
  assert.equal(first.luminanceVariance > .01, true, "YUE_E_LUMINANCE_VARIANCE");
  assert.equal(Math.abs(first.modelCoverage - second.modelCoverage) <= .0001, true, "YUE_E_FRAME_STABILITY");

  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  for (const angle of angles) {
    const expression = "(async()=>{window.__yueELookdevReview.setAngle(" + angle + ");return await window.__yueELookdevReview.sampleFrame()})()";
    const sample = await browser.evaluate(expression);
    assert.equal(sample.modelCoverage >= .20 && sample.modelCoverage <= .70, true, "YUE_E_ANGLE_COVERAGE_" + angle);
    const name = "lookdev-" + String(angle).padStart(3, "0") + ".png";
    await browser.capture(path.join(screenshots, name));
  }

  const failures = browser.events.filter((event) =>
    event.method === "Network.loadingFailed" ||
    event.method === "Runtime.exceptionThrown" ||
    event.method === "Inspector.targetCrashed" ||
    (event.method === "Log.entryAdded" && ["error", "warning"].includes(event.params.entry.level)) ||
    (event.method === "Runtime.consoleAPICalled" && event.params.type === "error")
  );
  assert.deepEqual(failures, []);
  const requested = browser.events
    .filter((event) => event.method === "Network.requestWillBeSent")
    .map((event) => new URL(event.params.request.url).pathname);
  assert.equal(requested.includes("/web/vendor/three.r128.min.js"), true);
  assert.equal(requested.includes("/web/vendor/GLTFLoader.r128.js"), true);
  assert.equal(requested.some((pathname) => /cdn|unpkg|jsdelivr/i.test(pathname)), false);
  console.log(JSON.stringify({
    ok: true, rendererRevision: "128", angleCount: 8,
    poseProbeCount: 5, semanticIdCount: initial.semanticIds.length,
    modelSha256: initial.modelSha256, screenshotDirectory: "artifacts/yue-e/phase-1"
  }));
} finally {
  await browser.close();
  await fixture.close();
}
~~~~

- [ ] **Step 4.10: Run the real-browser proof GREEN (3–5 minutes)**

Run:

~~~~powershell
node scripts/check-yue-e-lookdev-browser.mjs
~~~~

Expected final line shape:

~~~~json
{"ok":true,"rendererRevision":"128","angleCount":8,"poseProbeCount":5,"semanticIdCount":0,"modelSha256":"<64 uppercase hex>","screenshotDirectory":"artifacts/yue-e/phase-1"}
~~~~

The real semanticIdCount must be greater than zero; 0 above is only a JSON shape marker. The command must exit 0, create exactly lookdev-000.png, 045, 090, 135, 180, 225, 270 and 315, and leave no Edge or HTTP process.

- [ ] **Step 4.11: Commit the viewer, browser fixture and eight screenshots (2–4 minutes)**

Run:

~~~~powershell
git status --short
git add docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.html docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.css docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.js scripts/yue-e/lib/edge-cdp.mjs scripts/check-yue-e-lookdev-browser.mjs artifacts/yue-e/phase-1/lookdev-000.png artifacts/yue-e/phase-1/lookdev-045.png artifacts/yue-e/phase-1/lookdev-090.png artifacts/yue-e/phase-1/lookdev-135.png artifacts/yue-e/phase-1/lookdev-180.png artifacts/yue-e/phase-1/lookdev-225.png artifacts/yue-e/phase-1/lookdev-270.png artifacts/yue-e/phase-1/lookdev-315.png
git diff --cached --check
git commit -m "test: prove Yue E lookdev in Three r128"
~~~~

Expected: only the three review files, two browser files and eight screenshots are committed.

- [ ] **Step 4.12: Write the failing approval-boundary test (3–5 minutes)**

Create scripts/check-yue-e-approval-gate.mjs:

~~~~js
import assert from "node:assert/strict";
await assert.rejects(
  import("./yue-e/approve-traveler-lookdev.mjs"),
  /ERR_MODULE_NOT_FOUND/
);
~~~~

- [ ] **Step 4.13: Run the approval boundary RED (2 minutes)**

Run:

~~~~powershell
node scripts/check-yue-e-approval-gate.mjs
~~~~

Expected: exit non-zero because the import unexpectedly rejects the opposite way once the file is requested; replace this minimal test in Step 4.15 rather than preserving it.

- [ ] **Step 4.14: Implement the three-field approval writer (4–5 minutes)**

Create scripts/yue-e/approve-traveler-lookdev.mjs:

~~~~js
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyLookdevGate } from "./lib/yue-e-lookdev-gate.mjs";

const SHA = /^[A-F0-9]{64}$/;
const defaultGate = "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json";
const defaultCandidate = "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-lookdev.glb";
const defaultContract = "web/yue-e/character/lookdev-contract.js";

function inside(root, relative) {
  assert.equal(path.isAbsolute(relative), false, "APPROVAL_PATH_MUST_BE_RELATIVE");
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(root, relative);
  assert.equal(resolved.startsWith(absoluteRoot + path.sep), true, "APPROVAL_PATH_OUTSIDE_ROOT");
  return resolved;
}

export async function approveTravelerLookdev({
  root, gate = defaultGate, candidate = defaultCandidate, contract = defaultContract,
  modelSha256, now = () => new Date().toISOString()
}) {
  assert.match(modelSha256 || "", SHA, "APPROVAL_SHA_FORMAT");
  const verified = await verifyLookdevGate({ root, gate, candidate, contract, requireStatus: "pending" });
  assert.equal(modelSha256, verified.gate.model.sha256, "APPROVAL_SHA_MISMATCH");
  const before = verified.gate;
  const after = structuredClone(before);
  after.approval.status = "approved";
  after.approval.approvedModelSha256 = modelSha256;
  after.approval.approvedAt = now();
  assert.equal(Number.isFinite(Date.parse(after.approval.approvedAt)), true, "APPROVAL_DATE");
  const unchangedBefore = structuredClone(before); delete unchangedBefore.approval;
  const unchangedAfter = structuredClone(after); delete unchangedAfter.approval;
  assert.deepEqual(unchangedAfter, unchangedBefore, "APPROVAL_NON_APPROVAL_MUTATION");
  const gatePath = inside(root, gate);
  const temporary = gatePath + "." + randomUUID() + ".tmp";
  await writeFile(temporary, JSON.stringify(after, null, 2) + "\n", { flag: "wx" });
  await rename(temporary, gatePath);
  await verifyLookdevGate({ root, gate, candidate, contract, requireStatus: "approved" });
  return after;
}

const direct = path.resolve(process.argv[1] || "") === path.resolve(import.meta.filename);
if (direct) {
  const root = path.resolve(import.meta.dirname, "../..");
  const gate = process.argv.find((value) => value.startsWith("--gate="))?.slice(7) || defaultGate;
  const modelSha256 = process.argv.find((value) => value.startsWith("--model-sha256="))?.slice(15);
  const approved = await approveTravelerLookdev({ root, gate, modelSha256 });
  console.log(JSON.stringify({ ok: true, status: approved.approval.status, approvedModelSha256: approved.approval.approvedModelSha256, approvedAt: approved.approval.approvedAt }));
}
~~~~

- [ ] **Step 4.15: Replace the test with temp-root wrong-hash and tamper proof (4–5 minutes)**

Replace scripts/check-yue-e-approval-gate.mjs:

~~~~js
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { approveTravelerLookdev } from "./yue-e/approve-traveler-lookdev.mjs";
import { verifyLookdevGate } from "./yue-e/lib/yue-e-lookdev-gate.mjs";

const root = path.resolve(import.meta.dirname, "..");
const gate = "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json";
const candidate = "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-lookdev.glb";
const contract = "web/yue-e/character/lookdev-contract.js";
const build = "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-build-report.json";
const packageBoundary = "web/yue-e/package.json";
const sourceGate = JSON.parse(await readFile(path.join(root, gate), "utf8"));

if (process.argv.includes("--verify-live")) {
  const result = await verifyLookdevGate({ root, gate, candidate, contract, requireStatus: "approved" });
  console.log(JSON.stringify({ ok: true, mode: "live", status: result.gate.approval.status, modelSha256: result.gate.model.sha256 }));
  process.exit(0);
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "yue-e-approval-"));
const files = [gate, candidate, contract, build, packageBoundary, ...sourceGate.anchors.map((anchor) => anchor.path)];
try {
  for (const relative of files) {
    const destination = path.join(temporaryRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(root, relative), destination);
  }
  const before = await readFile(path.join(temporaryRoot, gate));
  await assert.rejects(
    approveTravelerLookdev({ root: temporaryRoot, gate, candidate, contract, modelSha256: "0".repeat(64) }),
    /APPROVAL_SHA_MISMATCH/
  );
  assert.deepEqual(await readFile(path.join(temporaryRoot, gate)), before);
  const approved = await approveTravelerLookdev({
    root: temporaryRoot, gate, candidate, contract,
    modelSha256: sourceGate.model.sha256,
    now: () => "2026-08-22T00:00:00.000Z"
  });
  assert.deepEqual(approved.approval, {
    status: "approved", approvedModelSha256: sourceGate.model.sha256,
    approvedAt: "2026-08-22T00:00:00.000Z"
  });
  const approvedWithoutApproval = structuredClone(approved); delete approvedWithoutApproval.approval;
  const sourceWithoutApproval = structuredClone(sourceGate); delete sourceWithoutApproval.approval;
  assert.deepEqual(approvedWithoutApproval, sourceWithoutApproval);
  const candidatePath = path.join(temporaryRoot, candidate);
  const tampered = await readFile(candidatePath);
  tampered[tampered.length - 1] ^= 1;
  await writeFile(candidatePath, tampered);
  await assert.rejects(
    verifyLookdevGate({ root: temporaryRoot, gate, candidate, contract, requireStatus: "approved" }),
    /GLB_|GATE_MODEL_HASH|GATE_VISUAL_HASH|GATE_RIG_HASH/
  );
  console.log(JSON.stringify({ ok: true, wrongHashRejected: true, tamperRejected: true, productionGateStatus: sourceGate.approval.status }));
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
~~~~

- [ ] **Step 4.16: Prove the production gate stays pending (3–5 minutes)**

Run:

~~~~powershell
$before = (Get-FileHash -Algorithm SHA256 docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json).Hash
node scripts/check-yue-e-approval-gate.mjs
$after = (Get-FileHash -Algorithm SHA256 docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json).Hash
if ($before -ne $after) { throw "approval test changed production gate" }
~~~~

Expected final line:

~~~~json
{"ok":true,"wrongHashRejected":true,"tamperRejected":true,"productionGateStatus":"pending"}
~~~~

- [ ] **Step 4.17: Commit the constrained approval seam (2–4 minutes)**

Run:

~~~~powershell
git add scripts/yue-e/approve-traveler-lookdev.mjs scripts/check-yue-e-approval-gate.mjs
git diff --cached --check
git commit -m "test: constrain Yue E lookdev approval"
~~~~

Expected: exactly two scripts are committed; the production gate is still pending.

- [ ] **Step 4.18: Run the complete machine gate immediately before review (3–5 minutes)**

Run:

~~~~powershell
node scripts/check-yue-e-lookdev-contract.mjs
node scripts/check-yue-e-character-scene.mjs
node scripts/check-yue-e-glb-parser.mjs
node scripts/check-yue-e-character-asset.mjs --stage=lookdev
node scripts/check-yue-e-lookdev-browser.mjs
node scripts/check-yue-e-approval-gate.mjs
~~~~

Expected: all six commands exit 0; Blender is exactly 5.1.2/ec6e62d40fa9; gate status remains pending; CPU and real-r128 pose probe counts are five; the browser checker recreates the same eight named screenshot paths.

- [ ] **Step 4.19: Start the persistent human-review URL (2 minutes)**

Run in a dedicated terminal:

~~~~powershell
node scripts/check-yue-e-lookdev-browser.mjs --serve --port=0
~~~~

Expected first line shape:

~~~~json
{"ok":true,"mode":"serve","url":"http://127.0.0.1:<ephemeral>/docs/superpowers/assets/yue-e/lookdev/review/lookdev-review.html"}
~~~~

Open exactly the printed URL. Keep this process alive while the user compares the live turntable, the 3200×1800 proportion board and the eight files in artifacts/yue-e/phase-1 against all three fixed-hash anchors.

---

## USER GATE A: Character lookdev and rig approval

Present these exact evidence items to the user:

1. The persistent review URL from Step 4.19.
2. docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-proportion-board.png.
3. artifacts/yue-e/phase-1/lookdev-000.png through lookdev-315.png.
4. The exact candidate SHA from docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json.
5. The five Blender source, five exported-CPU and five real-Three-r128 pose probe results.
6. The rigFingerprintSha256 and approvedLod0VisualFingerprintSha256 values.

Ask one binary question: “是否批准这个原创遇E旅人的外观、比例、材质、十二翅板、右腕工具和当前骨骼局部形变，作为 Phase 1 后续动作与运行时接线的唯一 LOD0 基线？”

**STOP. Do not run the approval CLI, do not alter the gate, do not create runtime assets, and do not begin Task 5 until the user explicitly answers approve or reject.**

- [ ] **Gate A rejection branch: preserve pending state (2–5 minutes)**

If the user rejects, stop the server with Ctrl+C and run:

~~~~powershell
node scripts/check-yue-e-character-asset.mjs --stage=lookdev
git diff -- docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json
~~~~

Expected: asset validation exits 0, approval.status remains pending and no approval diff exists. Record the user’s requested visual changes, return to Task 2.8, regenerate Tasks 2–4, and present a fresh Gate A; never hand-edit the GLB or weaken a threshold.

- [ ] **Gate A approval branch: bind approval to the reviewed bytes (3–5 minutes)**

Only after an explicit approval, stop the server with Ctrl+C and run:

~~~~powershell
$model = "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-lookdev.glb"
$sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $model).Hash.ToUpperInvariant()
if ($sha -notmatch "^[A-F0-9]{64}$") { throw "invalid model SHA" }
node scripts/yue-e/approve-traveler-lookdev.mjs --gate=docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json --model-sha256=$sha
node scripts/check-yue-e-approval-gate.mjs --verify-live
git add docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json
git diff --cached --check
git commit -m "chore: approve Yue E traveler lookdev gate"
~~~~

Expected: the CLI prints status approved and the same SHA; live verification exits 0; the commit contains only the gate JSON; its only semantic changes from the pending record are approval.status, approval.approvedModelSha256 and approval.approvedAt.

After either branch, confirm the Step 4.19 URL no longer responds. Phase 1A ends here. Task 5 and every runtime asset remain out of scope for this sub-plan.

---

## Plan self-review

- [ ] **Self-review 1: Verify order, scope and placeholder hygiene (2–3 minutes)**

Run:

~~~~powershell
rg -n "^(## Global Constraints|## File Map|## Fixed Types and Interfaces|## Task [1-4]:|## USER GATE A|## Plan self-review)" docs/superpowers/plans/2026-08-22-yue-e-phase-1a-character-gate.md
rg -n "TODO|TBD|FIXME|placeholder|web/assets/yue-e|Task 5" docs/superpowers/plans/2026-08-22-yue-e-phase-1a-character-gate.md
~~~~

Expected: headings appear in the required order; the second command reports only the explicit “no placeholder/no runtime/Task 5 out of scope” constraints, not an implementation gap.

- [ ] **Self-review 2: Verify immutable identities and exporter boundary (2–3 minutes)**

Run:

~~~~powershell
rg -n "ec6e62d40fa9|FE9724E075730551AC657D93C81D3FFFA878C7E0A1D65F454FF890901D3F6F6D|468E922942179B00659F5B16CAF7361D059B7CB6E2ACEEC947867F93DB4EEB55|1429B87737E92FFFAABA44577AF3579556B558F488A2A88787D20F7653312FBF|EXPORT_KWARGS|export_animations" docs/superpowers/plans/2026-08-22-yue-e-phase-1a-character-gate.md
~~~~

Expected: all three exact anchor hashes, Blender 5.1.2 build hash, the explicit exporter dictionary and export_animations:false are present.

- [ ] **Self-review 3: Verify every implementation action has code and evidence (3–5 minutes)**

Run:

~~~~powershell
$plan = Get-Content -Raw docs/superpowers/plans/2026-08-22-yue-e-phase-1a-character-gate.md
if ($plan -notmatch "bindPoseMaxResidual") { throw "missing bind-pose proof" }
if ($plan -notmatch "exportedPoseProbes") { throw "missing CPU pose proof" }
if ($plan -notmatch "runR128PoseProbe") { throw "missing r128 pose proof" }
if ($plan -notmatch "approvedLod0VisualFingerprintSha256") { throw "missing visual fingerprint" }
if ($plan -notmatch "USER GATE A") { throw "missing user stop" }
"Phase 1A plan self-review OK"
~~~~

Expected final line: Phase 1A plan self-review OK.
