# 风暴海域 UE5 Lookdev Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有“无尽风暴海域”预设导入独立的 UE 5.8.2 预览地图，并在 UE 中重建水面/船体材质、日夜光照与确定性风暴效果。

**Architecture:** 主仓库保留 Web/Three.js 预设作为当前运行实现；UE 工程 `E:/FE moster-yue-e-g0/unreal/YueEWorld` 新增独立 `Content/YueE/StormOcean` 资产域和 `L_YueE_StormOceanReview` 地图。Blender 只负责从现有 GLB 规范化几何并导出无材质 FBX，UE Python 负责导入、材质图、灯光、体积和 Niagara 预览资源，自动化脚本负责幂等性和资源契约。

**Tech Stack:** Blender 5.2.x headless Python, Unreal Engine 5.8.2 / DX12, UE Editor Python API, UE C++ Automation Tests, Node.js contract checks, Lumen GI/Reflections, Virtual Shadow Maps, Sky Atmosphere, Volumetric Clouds, Niagara.

**Spec:** `docs/superpowers/specs/2026-09-24-storm-ocean-ue-lookdev-design.md`

## Global Constraints

- UE 工程固定为 `E:/FE moster-yue-e-g0/unreal/YueEWorld/YueEWorld.uproject`，版本为 UE 5.8.2 / CL 56702186。
- 只写 `Content/YueE/StormOcean/`、对应导入临时目录和新增验证输出；不得保存 Gate0、Gate01、Gate02、MusicZone 地图。
- Blender 只生成规范化几何和无材质 FBX；材质、灯光、Niagara、后处理和最终渲染全部由 UE 生成。
- 本轮不创建 UE 播放器，不把主 Web/Three.js 播放时钟或音频迁移到 UE。
- 所有随机效果使用固定 seed；所有导入与重建脚本必须可重复执行，不得累积重复资产或 Actor。

---

### Task 1: 锁定源资产并生成 UE 交换文件

**Files:**
- Create: `E:/FE moster-yue-e-g0/art/blender/yue-e/export/storm-ocean/README.md`
- Create: `E:/FE moster-yue-e-g0/art/blender/yue-e/export/storm-ocean/export_storm_ocean_for_ue.py`
- Create: `E:/FE moster-yue-e-g0/art/blender/yue-e/export/storm-ocean/storm-ocean-source-manifest.json`
- Read: `E:/FE moster-yue-e-g0/web/data/storm-ocean-preset.json`
- Read: `E:/FE moster-yue-e-g0/web/bundled-assets/1dec0986-a81d-4847-af22-93d1976b5f2d/blender-output/storm-ocean-horizon.glb`
- Read: `E:/FE moster-yue-e-g0/web/bundled-assets/1dec0986-a81d-4847-af22-93d1976b5f2d/blender-output/pirate-ship-storm.glb`
- Read: `E:/FE moster-yue-e-g0/cycles-source/storm-ocean/storm-ocean-cycles-environment.blend`

**Interfaces:**
- Consumes: the stable preset ID, the ocean/ship GLB files, and the existing Blender executable configured in `.yue-e-local.json`.
- Produces: `SM_StormOcean_Surface.fbx`, `SM_StormOcean_Ship.fbx`, a source manifest with SHA-256, units, axis, object names, bounds, material-slot mapping, and a deterministic export report.

- [ ] **Step 1: Write the failing manifest test**

Add a Python test that fails unless the source files exist beneath the approved worktree, hashes match the manifest, the exported names are exactly `SM_StormOcean_Surface` and `SM_StormOcean_Ship`, and every output FBX has finite bounds and a non-zero mesh count.

- [ ] **Step 2: Run the test to verify it fails**

Run from the UE worktree:

```powershell
python scripts/yue-e/tests/test_storm_ocean_exchange.py -v
```

Expected: FAIL with a missing exchange manifest or missing FBX until the exporter is run.

- [ ] **Step 3: Implement deterministic Blender export**

Open each GLB in a fresh Blender session, select only the ocean surface and ship geometry, apply transforms, preserve meters and UE-compatible axis conventions, remove cameras/lights/material nodes, assign stable material slots (`Water`, `Wood`, `Iron`, `Canvas`), export FBX 7.4 with normals/tangents and UV0/UV1, and write the source/output hashes and geometry bounds to the manifest. Do not regenerate the embedded cloud puffs as separate meshes; they will be replaced by UE volumetric clouds and Niagara.

- [ ] **Step 4: Run the exporter and test**

Run:

```powershell
blender.exe --background --factory-startup --python art/blender/yue-e/export/storm-ocean/export_storm_ocean_for_ue.py -- --root E:/FE moster-yue-e-g0
python scripts/yue-e/tests/test_storm_ocean_exchange.py -v
```

Expected: PASS with two FBX files, a stable manifest, and no camera/light/material payload in the exchange geometry.

- [ ] **Step 5: Commit the exchange contract**

```powershell
git add art/blender/yue-e/export/storm-ocean scripts/yue-e/tests/test_storm_ocean_exchange.py
git commit -m "feat: add storm ocean UE exchange assets"
```

### Task 2: Import the exchange assets and build UE materials

**Files:**
- Create: `E:/FE moster-yue-e-g0/unreal/YueEWorld/Scripts/import_storm_ocean.py`
- Create: `E:/FE moster-yue-e-g0/unreal/YueEWorld/Scripts/validate_storm_ocean.py`
- Create: `E:/FE moster-yue-e-g0/unreal/YueEWorld/Content/YueE/StormOcean/Materials/` generated assets
- Read: `E:/FE moster-yue-e-g0/unreal/YueEWorld/Scripts/import_gate01_world.py`
- Read: `E:/FE moster-yue-e-g0/unreal/YueEWorld/Scripts/import_gate02_world.py`

**Interfaces:**
- Consumes: the Task 1 manifest and FBX paths.
- Produces: imported static meshes, parent materials and material instances under `/Game/YueE/StormOcean/`, plus `validate_storm_ocean.py --contract` returning a JSON report.

- [ ] **Step 1: Write the failing UE asset contract**

Make `validate_storm_ocean.py` require the two static meshes, the water/wood/iron/canvas material parents, their required scalar/vector parameters, and the source manifest hash. Make it fail with named codes such as `StormOceanMeshMissing` and `StormOceanMaterialParameterMissing` when the assets are absent.

- [ ] **Step 2: Run the contract before import**

Run the configured `UnrealEditor-Cmd.exe` with the project and `-run=pythonscript` contract invocation. Expected: the command exits non-zero and reports the named missing-asset codes.

- [ ] **Step 3: Implement idempotent FBX import**

Use the existing `AssetImportTask`/`FbxImportOptions` pattern. Import into `/Game/YueE/StormOcean/Meshes`, set the stable mesh names, enable Nanite only for static opaque meshes that pass the geometry bounds check, and reject source paths outside the approved worktree.

- [ ] **Step 4: Implement UE material graphs**

Create `M_StormOcean_Water` with two panning normal samples, water roughness, Fresnel, depth-based absorption, foam mask and `StormIntensity`; create `M_StormOcean_Wood`, `M_StormOcean_Iron`, and `M_StormOcean_Canvas` with the existing PBR maps plus wetness, edge response and cold storm tint. Create named instances for `Day`, `Sunset`, `Evening`, and `Thunderstorm`, and save every package before validation.

- [ ] **Step 5: Run import and contract**

Run the import script twice, then run `validate_storm_ocean.py --contract` and reload every package with `EditorAssetLibrary`. Expected: both runs produce the same asset set, no duplicate packages/actors, and the contract reports the exact material parameters and source hash.

- [ ] **Step 6: Commit the UE asset importer**

```powershell
git add unreal/YueEWorld/Scripts/import_storm_ocean.py unreal/YueEWorld/Scripts/validate_storm_ocean.py Content/YueE/StormOcean
git commit -m "feat: import storm ocean assets into UE"
```

### Task 3: Build the independent preview map and lookdev rig

**Files:**
- Modify: `E:/FE moster-yue-e-g0/unreal/YueEWorld/Scripts/import_storm_ocean.py`
- Create: `E:/FE moster-yue-e-g0/unreal/YueEWorld/Scripts/capture_storm_ocean_review.py`
- Create: `E:/FE moster-yue-e-g0/unreal/YueEWorld/Content/YueE/StormOcean/L_YueE_StormOceanReview.umap` generated asset

**Interfaces:**
- Consumes: imported meshes/material instances from Task 2.
- Produces: a named preview map with stable actor labels `StormOcean_Surface`, `StormOcean_Ship`, `StormOcean_SkyAtmosphere`, `StormOcean_Clouds`, `StormOcean_Fog`, `StormOcean_KeyLight`, `StormOcean_SkyLight`, and `StormOcean_PostProcess`.

- [ ] **Step 1: Add map contract assertions**

Extend `validate_storm_ocean.py` to require the exact map package and actor labels, verify no actor belongs to Gate01/Gate02/MusicZone packages, and assert Lumen GI/reflections, VSM, sky atmosphere, volumetric cloud, exponential height fog, fixed exposure, and disabled film grain/chromatic aberration/motion blur.

- [ ] **Step 2: Create the map idempotently**

Create or load only `/Game/YueE/StormOcean/L_YueE_StormOceanReview`, clear actors with the `StormOcean.Generated` tag, spawn the ocean and ship at the preset-relative placement, then spawn atmosphere, cloud, fog, warm key, cool skylight, and post-process actors with stable names. Keep the ship’s relative position and wave-following scale from the preset manifest.

- [ ] **Step 3: Add day/sunset/evening look controls**

Create a small UE-owned look controller asset or actor with a named enum-like integer `StormLook` (`Day=0`, `Sunset=1`, `Evening=2`, `Thunderstorm=3`) and apply the corresponding material instance parameters, directional-light color/intensity, skylight tint, fog color/density, cloud coverage and exposure without saving changes to other maps.

- [ ] **Step 4: Capture a deterministic review frame**

Capture one fixed camera frame for each look into `out/yue-e/storm-ocean-review/`, recording engine version, map package, source hashes, look name, resolution, and asset validation status. The capture script must use the same fixed seed and must fail if any required actor or material is missing.

### Task 4: Add deterministic Niagara storm effects and motion

**Files:**
- Modify: `E:/FE moster-yue-e-g0/unreal/YueEWorld/Scripts/import_storm_ocean.py`
- Create: `E:/FE moster-yue-e-g0/unreal/YueEWorld/Scripts/validate_storm_ocean_effects.py`
- Create: `E:/FE moster-yue-e-g0/unreal/YueEWorld/Content/YueE/StormOcean/VFX/` generated Niagara assets

**Interfaces:**
- Consumes: the preview map and look controller from Task 3.
- Produces: stable Niagara systems `NS_StormOcean_Rain`, `NS_StormOcean_Spray`, `NS_StormOcean_Foam`, and `NS_StormOcean_Lightning`, plus a fixed-seed motion/effect contract.

- [ ] **Step 1: Write effect contract checks**

Require all four systems, fixed seed `storm-ocean-ue-v1`, bounded particle counts, and named user parameters for storm intensity, wind direction, rain rate, spray rate and lightning interval. Fail if a system is missing or has unbounded spawn rates.

- [ ] **Step 2: Build effects from UE-owned assets**

Use Niagara GPU emitters for distant rain and foam, CPU emitters for near-camera spray and deterministic lightning flashes, with bounds sized to the review map. Use a short light pulse and material parameter pulse for lightning; do not depend on random engine state or an external audio player.

- [ ] **Step 3: Add ship motion**

Apply the existing storm wave sampling constants to a UE actor component or level sequence so the ship has bounded heave/pitch/roll. Clamp the motion to the preset’s maximum tilt and preserve its authored placement.

- [ ] **Step 4: Run effect validation and captures**

Run the effect contract, capture day/sunset/evening/thunderstorm frames, and compare the manifest and actor counts between two consecutive runs. Expected: identical asset names and stable seeded effect metadata.

### Task 5: Build the focused UE automation and handoff report

**Files:**
- Create: `E:/FE moster-yue-e-g0/unreal/YueEWorld/Source/YueEWorld/Private/Tests/YueEStormOceanAutomationTests.cpp`
- Create: `E:/FE moster-yue-e-g0/scripts/yue-e/tests/test_storm_ocean_review.py`
- Create: `E:/FE moster-yue-e-g0/docs/STORM_OCEAN_UE_REVIEW.md`
- Modify: `E:/FE moster-yue-e-g0/docs/YUE_E_PROGRESS.md`

**Interfaces:**
- Consumes: validation reports and the saved preview map from Tasks 2–4.
- Produces: a focused automation suite and a review report that separates passed UE preview checks from the explicitly incomplete WebView/IPC/audio handoff.

- [ ] **Step 1: Add automation assertions**

Cover map/package identity, required actors, material parameter presence, no Gate map mutation, deterministic look switching, effect system presence, bounded motion, and no second audio player. Register tests under `YueE.StormOcean`.

- [ ] **Step 2: Run compile and focused automation**

Build the UE editor target with the configured UE/VS toolchain, then run only `YueE.StormOcean` under DX12 and save the JSON report beneath `out/yue-e/storm-ocean-review/`.

- [ ] **Step 3: Run the full focused review command set**

Run the Blender exchange test, UE import twice, contract/effect validators, UE automation, and deterministic captures. Store hashes and the exact engine changelist in the report.

- [ ] **Step 4: Document limits and result**

Write `STORM_OCEAN_UE_REVIEW.md` with asset hashes, map path, look table, screenshot paths, test commands/results, and an explicit statement that main-app UE window/IPC/audio integration remains outside this preview.

- [ ] **Step 5: Commit the preview implementation**

```powershell
git add art/blender/yue-e/export/storm-ocean unreal/YueEWorld/Content/YueE/StormOcean unreal/YueEWorld/Scripts/import_storm_ocean.py unreal/YueEWorld/Scripts/validate_storm_ocean.py unreal/YueEWorld/Scripts/validate_storm_ocean_effects.py unreal/YueEWorld/Scripts/capture_storm_ocean_review.py unreal/YueEWorld/Source/YueEWorld/Private/Tests/YueEStormOceanAutomationTests.cpp scripts/yue-e/tests/test_storm_ocean_exchange.py scripts/yue-e/tests/test_storm_ocean_review.py docs/STORM_OCEAN_UE_REVIEW.md docs/YUE_E_PROGRESS.md
git commit -m "feat: add UE storm ocean lookdev preview"
```

## Plan Self-Review

- Spec coverage: source preservation and Blender/FBX boundary are covered by Task 1; UE materials and imports by Task 2; map and lighting by Task 3; storm VFX and motion by Task 4; validation and explicit non-integration limits by Task 5.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation step is used; every task names files, interfaces, commands and expected results.
- Type/interface consistency: Task 1 manifest feeds Task 2 importer; Task 2 assets feed Task 3 map; Task 3 map feeds Task 4 effects; Tasks 2–4 feed Task 5 automation and report.
