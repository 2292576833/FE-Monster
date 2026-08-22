# 遇E Gate 0：工程、宿主与进入场景链路 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付第一个可运行的 Windows `YueE-G0-<buildId>` 验收包：用户从现有“沙盒模式”旁的“场景”按钮进入独立 UE 5.8 / DX12 真实三维灰盒，宿主在连续 3 个真实成功 Present 后平滑揭示；退出、崩溃、断管道和窗口变化都平滑恢复原界面，主歌曲元素、媒体时钟和可听输出不中断；同时冻结昨天确认的三张人物图和后续 Gate 所需的地图/UI/预设基线。

**Architecture:** 保留 WinForms + 主 WebView2 作为播放器和应用权威，新建 `UnrealWorldHost` 作为 UE 子进程、Job Object、命名管道、owned top-level HWND、状态机和恢复的唯一权威。`YueEWorld.exe` 仅负责 DX12 三维画面、输入和 Gate 0 灰盒，不创建主歌曲播放器。主 WebView2 始终存活并保持可见，进入时只暂停非必要网页视觉循环并显示云雾保险层；UE 使用同款不透明雾画面在屏外完成最终分辨率预热，三个不同 DXGI Present 计数通过健康检查后才移入主窗口并散雾。Blender 5.2 LTS 只生成原创灰盒几何并导出无材质、无纹理、无动画 FBX，材质、灯光、雾和最终渲染全部在 UE 完成。

**Tech Stack:** Blender 5.2 LTS 原生 FBX 7.4 exporter、Unreal Engine 5.8 / FBX 2020.2 importer 兼容验收、UE 5.8 C++、Win64 / DirectX 12 / Lumen / Virtual Shadow Maps、Visual Studio 2022 Game Development with C++、Windows 11 SDK、.NET 8 WinForms + WebView2、Windows Job Object / Named Pipe / HWND APIs、Node.js `.mjs` 合约探针、PowerShell 构建与真实进程验收脚本。

**Spec:** [`docs/superpowers/specs/2026-08-21-yue-e-open-world-scene-design.md`](../specs/2026-08-21-yue-e-open-world-scene-design.md)

## Scope and Gate Order

本文件只执行 Gate 0，不提前制作 Gate 1 人物模型、Gate 2 动作、Gate 3 音乐区、Gate 4/5 空间 UI、Gate 6 无边界外围、Gate 7 探索成就或 Gate 8 最终安装器。规格是 Gate 0–8 的总路线图；每个后续 Gate 只在前一 Gate 获得用户对真实运行包的明确批准后，另写一份可执行计划。

此前以下 Three.js / GLB / 浏览器运行时计划已经失效，保留为历史记录但不得执行、复制命令或局部拼接：

- `docs/superpowers/plans/2026-08-21-yue-e-phase-1-character-runtime-shell.md`
- `docs/superpowers/plans/2026-08-22-yue-e-phase-1a-character-gate.md`
- `docs/superpowers/plans/2026-08-22-yue-e-phase-1b-runtime-shell.md`
- `docs/superpowers/plans/2026-08-22-yue-e-phase-1c-app-integration-release.md`

Gate 0 完成条件是生成真实可运行包和完整证据，把状态写成 `in_review`，然后停止等待用户验收。当前对话中的“可以”只批准设计与实施方向，不预先批准未来产物。

后续路线索引如下；文件只在前一 Gate 批准后创建：

| Gate | Future plan | Acceptance focus |
| --- | --- | --- |
| 1 | `yue-e-gate-1-character-master.md` | 严格按昨天人物图完成原创 Blender 模型、骨骼、FBX 和 UE 实时转台 |
| 2 | `yue-e-gate-2-motion-camera.md` | 丝滑走跑跳、攀爬、翻越、滑翔与第一/第三人称 |
| 3 | `yue-e-gate-3-music-zone.md` | 音乐区实体、重生、灯光雾和空间音频锚点 |
| 4 | `yue-e-gate-4-spatial-ui-slice.md` | 三预设、一歌单、实时 SceneCapture 与拖动枪垂直切片 |
| 5 | `yue-e-gate-5-complete-music-ui.md` | 两份冻结 manifest 的全部 UI、稳定 ID 和无损功能 |
| 6 | `yue-e-gate-6-unbounded-world.md` | 六域、World Partition/PCG/HLOD/LWC 和无边界外围 |
| 7 | `yue-e-gate-7-adventure-achievements.md` | 非战斗冒险、环境谜题和 6 项新成就 |
| 8 | `yue-e-gate-8-windows-release.md` | 全量预热、清晰度/性能、安装升级卸载和最终签名发布 |

## Known Execution Blockers

规划时本机已确认：

- UE 5.8.0 已存在于 `D:\xvhuan\UE_5.8`，CL `55116800`；
- 当前 Blender 只有 5.1.2，路径 `E:\New Folder\blender.exe`，不满足固定的 Blender 5.2 LTS；
- 未发现 Visual Studio 2022，本机只有 Visual Studio 2026；且未检测到 `Game Development with C++` / `NativeGame` 工作负载；
- Windows SDK `10.0.26100.0`、`10.0.28000.0` 与 .NET SDK `8.0.422` 已存在；
- Git LFS 3.7.1 可用，但仓库没有 `.gitattributes`，当前 LFS 文件数为 0；
- 当前根工作树含大量已有修改和未跟踪文件，不能直接作为 UE 生成目录；Gate 0 所需的播放器/UI 基线尚未形成可复现提交：四个共享 Web 文件有修改，`web/soundscape-runtime.js` 与整个 `web/assets/soundscape-workshop/` 七文件运行闭包尚未跟踪，而纯 `HEAD` 不含已确认的第 11 个预设。
- 当前 Windows CCD 只报告一个活动桌面目标 `DISPLAY1`；真实 mixed-DPI 转移验收需要至少两个同时活动、不同 effective DPI 且非 HMD/间接/虚拟输出的显示目标，因此本机当前必须报 `MixedDpiMonitorPairMissing`，合成 DPI 单元测试不能代替真实证据。

因此 Task 1 必须先返回 `BaselineCommitRequired`，由源工作树所有者整理并确认基线；不得复制整份脏文件或替用户提交。基线必须同时包含 11 个内置预设、bundled scene、动态协议、被跟踪的 `soundscape-runtime.js` 和完整 Workshop 引用闭包（`runtime.html`、`bridge.js`、bundle JS/CSS、`preview.gif`、`project.json`、`index.html`），以及本计划和正式 spec。随后工具链仍会因 Blender 5.2.0 portable、VS2022 NativeGame、Rust 1.89.0 和真实 mixed-DPI 双显示目标缺失失败。

## Global Constraints

- 开始执行前必须使用 `superpowers:using-git-worktrees` 建立独立工作树；工作树只能从 Task 1 确认的 `YUEE_BASE_COMMIT` 创建，不得从旧 `HEAD` 猜测基线，也不得清理、覆盖、暂存或提交根工作树中的既有用户改动。
- 所有跨任务本机路径与基线提交由仓库根目录、被 `.gitignore` 忽略的 `.yue-e-local.json` 提供；结构以 `scripts/yue-e/local-config.example.json` 为准。每个独立 PowerShell/Python/Node 入口都接受 `-Config`/`--config` 并自行加载，不能依赖上一个代理的环境变量。唯一嵌入式例外是 UE `PythonScriptPlugin`：`import_gate0_assets.py` 必须用 `unreal.SystemLibrary.get_command_line()` 读取 UE host switches `-YueERoot/-YueEConfig`（不是假设它们出现在 `sys.argv`），随后加载同一配置文件。
- 每个任务先写失败测试或失败探针，再写最小生产实现；每一小段通过后单独提交，提交前执行 `git diff --cached --check`。
- 手工文件编辑使用 `apply_patch`。Blender、Unreal、UAT、编译器和测试工具生成的 `.blend/.fbx/.uasset/.umap/.exe/.pdb/.utrace/.mp4/.json` 输出可由固定脚本产生。
- 全部可见三维几何必须来自 `art/blender/yue-e` 的原创 Blender 源；Blender 不制作最终材质、贴图绑定、灯光、动画或渲染。
- 规格中的“遵循 UE 5.8 的 FBX 2020.2 管线约束”固定解释为 importer compatibility，不虚构 Blender 5.2 不提供的 2020.2 exporter。源 FBX 必须由固定 Blender exporter 产生并声明 binary FBX version 7400；UE 5.8 的 FBX 2020.2 importer 必须在 warnings-as-errors 下真实导入、保存、重载并通过 bounds/UV/collision/tangent 验证。若失败，Gate 失败；不得改版本头、伪装转换或未经批准引入另一 DCC/SDK。
- 不复制、提取、反编译或导入《光·遇》的任何模型、贴图、骨骼、动画、服装、关卡、符号或音频。昨天确认的图只作为原创重建的视觉母版。
- `DesktopSceneHost` 必须保持现有 WorkerW 壁纸职责；遇E禁止继承它、复用它的消息族、调用跨进程 `SetParent`、设置 `WS_EX_TRANSPARENT` 或 `WS_EX_NOACTIVATE`。
- 主 `#audio` 是唯一主歌曲媒体元素。仓库中 `#rhythmGameAudio`、`#petAssistantAudio` 和连麦辅助 audio 是合法的其他用途，所以测试不得错误断言页面只有一个 `<audio>`；应断言 ID 为 `audio` 的主歌曲元素实例不变，且 UE/场景组件没有第二个主歌曲源或原生歌曲 session。
- Gate 0 只证明有界优先队列/latest-value 原语不会饿死生命周期消息，并明确拒绝未协商的 `spatial.pose`；不声称 UE → native audio 的完整 30Hz 姿态生产链已经接通。正式姿态和音乐区空间化属于后续 Gate 3/5。Gate 0 仍必须证明没有 UE 主歌曲 Audio Component、没有第二个可听主歌曲 sink、进入退出时歌曲不中断。
- 生产验收必须使用打包后的 Win64 DX12 runtime；`-NullRHI`、Editor tick、fake child 和静态截图都不能替代三次成功 Present 或真实窗口验收。
- UE 覆盖期间主 WebView2 不导航、不销毁、不重建、不设为不可见；只显示不透明云雾保险层并暂停明确列出的装饰 RAF，播放器、命令总线和音频轮询保持运行。
- Gate 0 只产出便携验收包；最终安装器签名、升级和卸载归 Gate 8。Gate 0 仍须把 UE runtime 的 build ID、文件清单和 SHA-256 摘要嵌入宿主构建并在启动前校验。
- 每次被状态机真正接受的 `Idle → Starting` 产生新的 `activationRequestId + sessionId + processGeneration`；非 Idle 连点返回当前 activation receipt，不产生新值。一次自动恢复保留 activation、但必须生成新的 `sessionId + processGeneration`。WebView 导航使用独立 `webViewGeneration`，主界面状态使用独立 `stateRevision`；三者不可复用或混称。

## Frozen Gate 0 Contracts

### Character and Design Baselines

Gate 0 不建人物，但必须冻结下列三张昨天确认的正式人物母版；Gate 1 只能据此原创建模：

| ID | Repository path | Dimensions | Git blob | SHA-256 |
| --- | --- | --- | --- | --- |
| `CharacterMaster-01` | `docs/superpowers/assets/yue-e/e-traveler-approved.png` | 1536×1024 | `cc08750564267e78a4c1065516362db9a1aa57de` | `FE9724E075730551AC657D93C81D3FFFA878C7E0A1D65F454FF890901D3F6F6D` |
| `CharacterMotionReference-01` | `docs/superpowers/assets/yue-e/e-traveler-actions-approved.png` | 1774×887 | `64759a8de107167af53a2361eb2237fa72e4b660` | `468E922942179B00659F5B16CAF7361D059B7CB6E2ACEEC947867F93DB4EEB55` |
| `CameraCompositionReference-01` | `docs/superpowers/assets/yue-e/camera-views-approved.png` | 1817×866 | `7d42f54788f3356c84e306ee13538bcafdac1d64` | `1429B87737E92FFFAABA44577AF3579556B558F488A2A88787D20F7653312FBF` |

受保护角色轮廓固定为：3.2–3.8 头身、珍珠白块面短发、深靛面罩与两道暖琥珀横向光眼、米白高领短衣和暖橙边、深海军蓝灯笼短裤、奶白软靴、胸口暖琥珀光核、左腕青蓝光环、背部六片有厚度的透明分段翼。后来上传的拼图只保留为历史风格参考，不覆盖上述母版。

`WorldMapReference-01` 固定为已获用户认可的无边界地图拓扑。原稿 `.superpowers/brainstorm/1564-1787315560/content/yue-e-world-map-v2-unbounded.html` 提升为受控的 `world-map-reference-01.html`，同时生成机器可验收的 `world-map-reference-01.json`；二者都只锁定拓扑/构图，不冒充 3D 场景。JSON 必须包含顶视 SVG `viewBox`、节点坐标、稳定 ID、邻接表、开放扩展方向、源/目标 SHA-256，并满足：

- 世界名称是“遇E”；`music-zone` 只是场景内的一块区域，固定在逻辑原点，并同时是默认重生点、空间音频与悬浮 UI 锚点；
- 六个正式区域 ID 恰为 `windstring-meadow`、`cloudridge-court`、`storm-corridor`、`mirror-rain-coast`、`mist-sound-woodland`、`deep-resonance-canyon`；
- 已批准的放射拓扑中，`music-zone` 分别与上述六域相邻；不得擅自改为一条线性关卡；
- 六个留白位 ID 恰为 `future-content-01` … `future-content-06`，保留原稿坐标 `(155,347)`、`(753,354)`、`(1087,325)`、`(408,654)`、`(783,653)`、`(463,51)`，并记录最近正式区域与开放扩展方向；
- 世界没有视觉终止边界，且每个方向保留可添加新内容的空地。HTML 可离线打开；JSON 与 HTML 中的节点、坐标和连线必须双向一致。

`SceneUIManifest-v1` 和 `PresetManifest-v1` 只冻结稳定 ID、当前 DOM/模块来源、视觉基准和后续空间组件语义，不在 Gate 0 把 UI 搬入 UE。预设目录不能只抄十个 HTML 按钮：必须同时包含 `app.js` 的 11 个正式内置播放预设（`lyric`、`wallpaper`、`cube`、`free-cubes`、`void-prism`、`topography`、`soundscape-workshop`、`chladni`、`rain-glass`、`cover-particles`、`book`）、`web/data/storm-ocean-preset.json` 的 bundled scene `preset-storm-ocean-horizon`，以及 `fe-monster.scene-preset/v1` 动态用户预设注册协议。

### Runtime State Machine

所有状态变更只由 `UnrealWorldHost` 串行化，完整允许表如下；未列出的事件均返回稳定拒绝码且不改变状态：

| Current | Event | Next | Required actions / generation rule |
| --- | --- | --- | --- |
| `Idle` | accepted `enter` | `Starting` | 新建 activation、session、process generation；校验 runtime |
| any non-Idle | duplicate `enter` | unchanged | 返回当前 activation receipt；不新建任何 generation |
| `Starting` | suspended process jobbed and resumed | `Handshaking` | 绑定 PID/Job/pipe/owned HWND |
| `Handshaking` | verified `hello` | `Warming` | 回 `helloAck`，发送最终物理像素 bounds revision |
| `Warming` | 3 consecutive accepted `frame.safe` | `ReadyHidden` | 三帧必须来自当前 bounds revision 与 swap-chain epoch |
| `ReadyHidden` | cover requested | `CoveringWeb` | 请求 Web 在 `900ms` 内变为全不透明 |
| `CoveringWeb` | opaque ack + 3 final-position safe Presents | `Revealing` | 移入 UE、发新 bounds revision，Web 不透明时再等三帧，随后发送 `scene.reveal(900ms)` |
| `Revealing` | matching `revealReady(fogClear=true)` | `Active` | 恢复 UE 输入；底层 Web cover **保持已确认的 opaque**，视觉循环保持暂停 |
| `Revealing/Active` | controllable move/resize gesture intent, intercepted before the first owner position mutation | `Suspending` | 冻结输入并发送 `scene.suspend(300ms)`；在 UE 雾层确认 opaque 前不放行 `WM_NCLBUTTONDOWN`、不移动 owner/UE；matching ack 后隐藏 UE 并签发一次性 gesture permit |
| `Suspending` | coalesced Host-controlled layout event | unchanged | 只保留最新布局意图；不重复动画、不创建新 command receipt |
| `Suspending` | matching `suspendReady` | `Suspended` | UE 已 `fogOpaque + inputFrozen`；底层 Web 仍 opaque，此时才可隐藏/移出或应用最终布局 |
| `Revealing/Active/Suspending/Restoring` | OS-forced owner conceal (`IsIconic`/Win+D/cloak/display sleep-loss) | `Suspended(SystemForced)` | Windows 可在 Host 回调前强制隐藏 owned HWND；立即冻结输入、取消旧 safe/reveal/layout receipt、递增 concealment epoch，并调用 `LatchHiddenForSystemRestore(epoch)` 防止系统自行恢复时暴露 clear/stale UE；在 pipe 可用时 best-effort 发 `scene.suspend`，但不伪造/等待 `suspendReady`；底层 Web 已保持 opaque |
| `Revealing/Active/Suspending/Restoring` | unprepared owner `WM_WINDOWPOSCHANGING`/DPI/maximize/snap/topology mutation | `Suspended(SystemForced)` | 主窗 hook 必须在调用 base/DefWindowProc 前同步隐藏并锁住 UE，随后才允许 owner 改位；该 observation sequence 成为新 concealment epoch，取消旧 permit/receipt，并走 fresh-ack restore，任何可见帧都不得出现 owner/UE 矩形分离 |
| `Starting/Handshaking/Warming/ReadyHidden/CoveringWeb` | OS-forced owner conceal | `Exiting` | UE 从未揭示；取消本次 enter 并可靠/超时清理，恢复后保持 Idle，用户可重进 |
| `Covering` | OS-forced owner conceal | `Exiting` | 系统已经安全隐藏且 Web opaque；取消 exit-fog wait，进入可靠 shutdown |
| `Suspended(SystemForced)` | matching late `suspendReady` for current concealment epoch | `Suspended(Acknowledged)` | 只接受当前 command/epoch；保留 hidden latch，不立即显示；重新评估最新 owner/display observation |
| `Suspended(SystemForced)` | valid owner/display restore before a matching ack | `Suspending(SystemForcedRestore)` | 保留 hidden latch；为当前 epoch 发送一条**新的** `scene.suspend(300ms)`，旧/best-effort receipt 一律拒绝；没有 fresh ack 绝不显示 UE |
| `Suspending(SystemForcedRestore)` | matching fresh `suspendReady` | `Suspended(Acknowledged)` | 确认 fog opaque/input frozen；若最新布局仍有效且可见，串行排入 restore-layout；否则继续隐藏 |
| `Suspending(SystemForcedRestore)` | 1000ms ack deadline / pipe loss | `Recovering` or `Faulted` | `transitionMs` 仍为 300ms，但 Host 另给 700ms 调度/IPC 余量；保持 Web opaque 和 hidden latch，终止/恢复当前 UE generation；不得把无 ack 当成功 |
| `Suspended(Acknowledged)` | valid visible/restored layout | `Restoring` | 应用最终 bounds 与新 bounds/swap-chain epoch；仅在 Web opaque 后按同一 concealment epoch 释放 hidden latch，使 UE 可在保险层下产生三帧真实 safe Presents |
| `Restoring` | 3 final-position safe Presents | unchanged | 发送一次 `scene.reveal(900ms)`；在 matching `revealReady` 前保持输入冻结 |
| `Restoring` | matching `revealReady(fogClear=true)` | `Active` | 恢复输入；底层 Web 继续 opaque；一次布局恢复完成 |
| `Restoring` | new Host-controlled move/resize/DPI invalidation | `Suspending` | 取消旧 safe-frame/reveal receipt，发送新的 `scene.suspend` 并只保留最新布局；late `revealReady` 必须拒绝 |
| `Active` | exit / UE exit request | `Covering` | 冻结 UE 输入，发送 `scene.prepareExit`；UE 用 `900ms` 升雾，底层 Web 已是 opaque |
| `Covering` | matching `exitReady` | `Exiting` | 仅当 UE `fogOpaque + inputFrozen + renderQuiescent` 才隐藏；底层 opaque cover 天然接住画面 |
| `Exiting` | Web clear ack → shutdown ack/process exit | `Idle` | 隐藏 UE 后 Web 退雾；再可靠 `shutdown`，等 ack/自退，最后关闭 Job/恢复焦点 |
| `Starting/Handshaking/Warming/ReadyHidden/CoveringWeb` | exit / cancel | `Exiting` | UE 从未可见；盖层保持安全，正常/超时清理后回 Idle |
| `Revealing` | exit / cancel | `Covering` | 取消/反转散雾，发送 `scene.prepareExit`，必须重新升至全不透明后才隐藏 |
| `Suspending/Restoring` | exit / cancel | `Covering` | 取消当前布局事务并用新的 command ID 发送 `scene.prepareExit`；matching `exitReady` 前不隐藏 |
| `Suspended` | exit / cancel | `Exiting` | UE 已隐藏且 Web 已 opaque；直接进入可靠 shutdown/自退路径 |
| runtime state | first retryable runtime fault | `Recovering` | 先恢复 Web；保留 activation，换新 session/process generation |
| `Recovering` | restart admitted | `Starting` | 同 activation 自动恢复仅一次 |
| runtime state | second/non-retryable fault | `Faulted` | 保留可诊断状态与重试/退出按钮；不得自动跳 Idle |
| `Faulted` | explicit retry | `Starting` | 新 activation、session、process generation；重试预算重置 |
| `Faulted` | dismiss / exit | `Idle` | 清错误并恢复焦点 |
| any non-Idle | WebView invalidated | `Exiting` | 先安全覆盖/停 UE；不宣称 Web 音频对象身份延续 |
| `Idle` | main app close | unchanged | 不创建伪 session；直接运行主窗体 close coordinator/既有 cleanup |
| any non-Idle | main app close | `Exiting` | 保留当前非空 session/process identity，最多等待 3 秒，然后关闭 Job 并允许主窗体退出 |

`frame.safe` 只有在打包 DX12 runtime 的 native swap-chain present serial 严格递增、设备未丢失、窗口未最小化、最终尺寸渲染资源已准备并连续满足 3 帧时才计数；game tick、Slate tick、Editor frame 或假进程消息不得计数。预热位置可以位于主内容区外，但 Present 必须真实递增；若显卡/合成器不为该非最小化预热窗口产生成功 Present，进入失败并保留原界面，不能放宽成 tick 计数。

### IPC Envelope

唯一线协议为单实例双向 byte-mode Named Pipe，4-byte little-endian 长度 + UTF-8 JSON，硬上限 1 MiB：

```json
{
  "protocol": "yuee.ipc",
  "major": 1,
  "minor": 0,
  "sessionId": "128-bit-lowercase-hex",
  "processGeneration": 1,
  "seq": 42,
  "type": "frame.safe",
  "commandId": null,
  "replyTo": null,
  "expectedRevision": null,
  "revision": 0,
  "payload": {}
}
```

Gate 0 的规范消息表如下；schema 为每一类型固定 direction、capability、priority、payload 与关联语义，未列出的字段由 `additionalProperties: false` 拒绝：

| Type | Direction | Capability | Priority | Required payload / correlation |
| --- | --- | --- | --- | --- |
| `hello` | UE → Host | `lifecycle.v1` | lifecycle | UE/host PID、build ID、exact loaded map package `/Game/YueE/Gate0/L_YueE_Gate0`、capabilities、16-hex sender command nonce；唯一 command，expected revision 0 |
| `helloAck` | Host → UE | `lifecycle.v1` | lifecycle | negotiated capabilities、heartbeat intervals、Host 16-hex command nonce；`commandId + expectedRevision + replyTo` |
| `load.progress` | UE → Host | `lifecycle.v1` | state | stage enum、0..1 progress、resourceReady；只在当前 session |
| `heartbeat` | both | `heartbeat.v1` | health | monotonic sender time；有 `commandId` |
| `heartbeatAck` | both | `heartbeat.v1` | health | receiver monotonic time；`replyTo = heartbeat.commandId` |
| `window.bounds` | Host → UE | `window.v1` | state | physical x/y/width/height、`dpiX`/`dpiY`、strictly increasing `boundsRevision`；`commandId + expectedRevision` |
| `frame.safe` | UE → Host | `present-health.v1` | present | matching `boundsRevision`、`swapChainEpoch`、strictly increasing `presentSerial`、render width/height、`frameTimeMs`、`resourceReady`、device-ok |
| `scene.reveal` | Host → UE | `lifecycle.v1` | lifecycle | `fogTarget: "clear"`、`transitionMs: 900`；`commandId + expectedRevision` |
| `revealReady` | UE → Host | `lifecycle.v1` | lifecycle | `fogClear: true`、renderReady；`replyTo = scene.reveal.commandId` |
| `scene.suspend` | Host → UE | `lifecycle.v1` | lifecycle | reason `layout|move|resize|dpi|minimize|display-loss`、`fogTarget: "opaque"`、`transitionMs: 300`；`commandId + expectedRevision` |
| `suspendReady` | UE → Host | `lifecycle.v1` | lifecycle | `fogOpaque: true`、inputFrozen、renderQuiescent；`replyTo = scene.suspend.commandId` |
| `scene.exitRequested` | UE → Host | `lifecycle.v1` | lifecycle | reason `escape|alt-f4|wm-close|fatal-ui`；`commandId + expectedRevision` |
| `scene.prepareExit` | Host → UE | `lifecycle.v1` | lifecycle | deadlineMs、reason、`fogTarget: "opaque"`、`transitionMs: 900`；`commandId + expectedRevision` |
| `exitReady` | UE → Host | `lifecycle.v1` | lifecycle | `fogOpaque: true`、inputFrozen、renderQuiescent；`replyTo = scene.prepareExit.commandId` |
| `shutdown` | Host → UE | `lifecycle.v1` | lifecycle | deadlineMs；`commandId + expectedRevision`，可重复同 canonical payload |
| `fatal` | UE → Host | `lifecycle.v1` | lifecycle | stable error code、retryable；不得含路径/stack/media URL |
| `command.result` | both | `core` (not negotiated) | lifecycle | `replyTo` required；status `accepted|idempotent|rejected`、`currentRevision`、sanitized error code/retryable；自身无 `commandId/expectedRevision` |

握手能力 Gate 0 固定只广告 `window.v1`、`present-health.v1`、`lifecycle.v1`、`heartbeat.v1`。`command.result` 是始终可用的 core 协议。已知但未协商的 playback/pose/transform 必须拒绝。`YueEMessagePriority` 固定六值 `lifecycle|control|health|present|state|telemetry`；priority 不在 wire 中，由 schema 的消息 type 唯一路由，发送方不可伪造。未来 pose/preview 使用 telemetry keyed latest-value。

`seq` 是每方向、每 session 独立严格递增的包序号。每个修改型请求带 `commandId + expectedRevision`，并在 transition gate 内比较。命令指纹对对象 `{sessionId,processGeneration,type,expectedRevision,payload}` 使用 **RFC 8785 JSON Canonicalization Scheme (JCS)** 后做 SHA-256：UTF-8、JCS 属性排序/最短转义与 IEEE-754 number serialization、数组保序。Identity/revision/counter 字段必须是 JS exact-range 整数；schema 明确允许有限的 `load.progress` 0..1、`frameTimeMs` 0..1000 和未来 pose 数值，拒绝 NaN/Infinity，JCS 将 `-0` canonicalize 为 `0`。指纹不含 seq/response revision。重复 ID + 同指纹返回原 reply/idempotent；同 ID + 不同指纹为 conflict；新命令旧 revision 为 RevisionConflict。RevisionConflict 后若 intent 仍有效，发送方用返回 currentRevision 和**新 commandId**立即重试；旧 commandId 不改指纹，动画/副作用不得重启。Golden fixtures cover reordered keys、等价 Unicode/number serialization、true payload conflict 与 `revealReady → immediate Esc → new-ID retry`。

`commandId` 格式固定为 `<16-lowerhex-senderNonce>-<16-lowerhex-commandOrdinal>`；ordinal 是 JS exact-range 正整数。每端每 session 用 CSPRNG 生成 nonce：UE 的 nonce/ordinal-1 commandId 随 verified `hello` 绑定，Host nonce 随 `helloAck` 下发；绑定前除 hello/helloAck 外不接受修改命令，恢复到新 session 必须换 nonce。每方向维护 512-ordinal sliding seen bitmap and ≤512 receipt records (TTL 5min). Out-of-order only inside unseen window；seen+cache returns receipt，seen+expired/below-window returns `ReceiptExpired` without replay，wrong nonce rejects. Fixtures cover pre-bind/wrong/restart nonce；100,000 bounds stress proves bounded memory and no ancient replay.

宿主与 UE 都每 500ms 发送心跳；pipe EOF 或子进程退出立即故障恢复，宿主 2 秒收不到有效 UE 心跳先恢复 Web 再终止 Job，UE 5 秒收不到宿主心跳请求自退出。同一次 activation 最多自动重启一次。

### Web Message Family

仅主 WebView2、已完成导航且来源严格等于 `new Uri(options.Url)` 的规范化 scheme/host/port origin 时接受；现有 `ClientOptions` 类型不新增不存在的 `AppUri` 属性：

```text
fe-yue-e-command        Web → WinForms (`enter | exit | retry`)
fe-yue-e-state          WinForms → Web
fe-yue-e-cover          WinForms → Web
fe-yue-e-cover-ack      Web → WinForms
fe-yue-e-player-probe   WinForms ↔ Web（只用于连续性验收）
```

消息 schema version 固定为 1。解析失败直接拒绝，绝不退回现有宽松字符串窗口命令。桌宠、桌面场景、非 embedded client 和旧 WebView generation 无权进入遇E。

Web 字段固定为：

```ts
type YueEWebCommandV1 = {
  type: "fe-yue-e-command";
  schemaVersion: 1;
  action: "enter";
  requestId: string;
  webViewGeneration: number;
  navigationNonce: string;
  expectedStateRevision: number;
} | {
  type: "fe-yue-e-command";
  schemaVersion: 1;
  action: "exit" | "retry";
  requestId: string;
  webViewGeneration: number;
  navigationNonce: string;
  sessionId: string;
  processGeneration: number;
  activationRequestId: string;
  expectedStateRevision: number;
};

type YueEHostStateV1 = {
  type: "fe-yue-e-state";
  schemaVersion: 1;
  sessionId: string | null;
  processGeneration: number | null;
  webViewGeneration: number;
  navigationNonce: string;
  activationRequestId: string | null;
  stateRevision: number;
  evidenceEnabled: boolean;
  evidenceNonce?: string;
  phase:
    | "idle" | "starting" | "handshaking" | "warming"
    | "ready-hidden" | "covering-web" | "revealing" | "active"
    | "suspending" | "suspended" | "restoring"
    | "covering" | "exiting" | "recovering" | "faulted";
  canRetry: boolean;
  error?: { code: string; retryable: boolean; message: string };
};

type YueECoverV1 = {
  type: "fe-yue-e-cover";
  schemaVersion: 1;
  requestId: string;
  sessionId: string;
  processGeneration: number;
  webViewGeneration: number;
  navigationNonce: string;
  activationRequestId: string;
  target: "opaque" | "clear";
  transitionMs: number;
};

type YueECoverAckV1 = Omit<YueECoverV1, "type" | "transitionMs"> & {
  type: "fe-yue-e-cover-ack";
};

type YueEPlayerProbeV1 = {
  type: "fe-yue-e-player-probe";
  schemaVersion: 1;
  kind: "request";
  requestId: string;
  evidenceNonce: string;
  webViewGeneration: number;
  navigationNonce: string;
  operation: "capture-baseline" | "sample";
} | {
  type: "fe-yue-e-player-probe";
  schemaVersion: 1;
  kind: "response";
  replyTo: string;
  evidenceNonce: string;
  webViewGeneration: number;
  navigationNonce: string;
  observations: {
    sameElement: boolean;
    sameSource: boolean;
    sameQueueRevision: boolean;
    sourceMutationCount: number;
    timeDeltaMs: number;
    pausedEqual: boolean;
    rateEqual: boolean;
    mediaElementSourceCount: number;
    bridgePlayCount: number;
    bridgePauseCount: number;
    bridgeLoadCount: number;
    bridgeSeekCount: number;
  };
};
```

On each accepted main-WebView `NavigationCompleted`, Host increments `webViewGeneration`, creates a cryptographically random lowercase 32-hex `navigationNonce`, binds both before enabling messages, and immediately posts the Idle/current `fe-yue-e-state` containing them. Web keeps the scene button disabled until that bootstrap state arrives and echoes both fields in every command/cover ack; neither value comes from URL or UE. An internal-evidence build additionally creates a per-host-run 32-hex `evidenceNonce` and exposes it only in this state to the approved main WebView; normal mode sends `evidenceEnabled:false` and omits it. Idle requires both `sessionId:null` and `processGeneration:null`; every non-Idle phase requires both non-null, with schema conditionals and positive process generation. `stateRevision` increases only for accepted mutation. Cover correlates by request/session/process/activation/WebView/nonce tuple.

Web action precedence inside the Host transition gate is fixed: (1) validate the approved main-WebView identity, current navigation tuple, lowercase 32-hex request ID, strict command schema/exact-range fields, then fingerprint the entire parsed command with JCS + SHA-256; an `exit`/`retry` tuple must be structurally non-empty here, but is not compared with current state yet; (2) consult a ≤512-record/5-minute receipt ledger keyed by current `webViewGeneration + navigationNonce + requestId` whose record also binds action, command fingerprint and the activation/session/process scope that produced the receipt—same scoped ID + same fingerprint returns the original receipt even if exit has since completed to Idle, while same ID + different fingerprint is conflict; navigation invalidation clears the ledger, and a replay remains a read-only receipt for its recorded scope rather than ever being reinterpreted/applied to a later activation; expired receipts return `ReceiptExpired`; (3) for a new command, non-Idle `exit`/`retry` must first exactly match the current `activationRequestId + sessionId + processGeneration`, so a delayed old activation can never affect a replacement; a new `enter` while non-Idle returns the current activation receipt, and an already-covering/exiting `exit` returns the current exit receipt without comparing stale `expectedStateRevision`, because neither mutates; (4) only a new structurally valid `exit` received while Idle returns and caches an Idle no-op receipt without current-session or revision comparison; `retry` is never an Idle no-op; (5) only a genuinely mutating new enter/exit/retry compares `expectedStateRevision`, then mutates and caches. `retry` is mutating and valid only from `Faulted`. Fixtures cover exit replay after completion to Idle, replay during a replacement activation without mutation, new Idle no-op exit, old-session exit against a replacement activation, stale-revision duplicate enter/exit, same-ID same/different-fingerprint replay, cache expiry/bounds, navigation-ledger invalidation and real stale mutating action conflict.

Player probe exists only when internal evidence is enabled and nonce/navigation match. It never loads media and never carries URL/path/source tokens. `capture-baseline` stores identities only inside the closure; `sample` returns exact booleans/counters and correlates by `replyTo`. Fixture loading is driven separately through the existing local-file input as defined in Task 9.

## Target File Layout

```text
.gitattributes
.gitignore
.yue-e-local.json                     # ignored, machine-local

contracts/yue-e/
  ipc-v1.schema.json
  ipc-v1-fixtures.json
  web-message-v1.schema.json
  reference-baselines-v1.schema.json
  world-map-reference-v1.schema.json

docs/superpowers/assets/yue-e/
  reference-baselines-v1.json
  world-map-reference-01.html
  world-map-reference-01.json
  ui-baselines/playlist-and-player-1920x1080.png
  ui-baselines/preset-picker-1920x1080.png
  ui-baselines/search-suggestions-1920x1080.png
  ui-baselines/settings-center-1920x1080.png
  ui-baselines/achievements-1920x1080.png
  ui-baselines/function-shortcuts-1920x1080.png
  ui-baselines/capture-log.json

web/scene-widgets/manifests/
  SceneUIManifest-v1.json
  PresetManifest-v1.json

scripts/yue-e/
  local-config.example.json
  toolchain-lock.json
  check-yue-e-toolchain.ps1
  create-gate0-reference-manifest.ps1
  build-yue-e-runtime.ps1
  stage-yue-e-gate0.ps1
  collect-yue-e-gate0-evidence.ps1
scripts/check-yue-e-toolchain-contract.mjs
scripts/check-yue-e-reference-manifests.mjs
scripts/check-yue-e-ipc-contract.mjs
scripts/check-yue-e-web-contract.mjs
scripts/check-yue-e-web-bridge.mjs
scripts/check-yue-e-player-continuity.mjs
scripts/check-yue-e-runtime-package.ps1
scripts/check-yue-e-window-contract.ps1
scripts/check-yue-e-host-integration.ps1
scripts/check-yue-e-package-runtime-readonly.ps1
scripts/check-yue-e-audio-continuity.ps1
scripts/check-yue-e-transition-video.mjs
scripts/analyze-yue-e-insights.ps1
scripts/check-yue-e-gate0.ps1
scripts/fixtures/yue-e-transition/pass-1920x1080-60.mp4

art/blender/yue-e/environment/gate0/
  yue-e-gate0-test-geometry.blend
art/blender/yue-e/scripts/
  create_gate0_test_geometry.py
  validate_gate0_fbx.py
art/blender/yue-e/export/gate0/        # content-validated FBX, tracked through LFS

unreal/YueEWorld/
  YueEWorld.uproject
  Config/DefaultEngine.ini
  Config/DefaultGame.ini
  Source/YueEWorld.Target.cs
  Source/YueEWorldEditor.Target.cs
  Source/YueEWorld/YueEWorld.Build.cs
  Source/YueEWorld/YueEWorld.cpp
  Source/YueEWorld/YueEWorld.h
  Source/YueEWorld/Public/YueEHostProtocol.h
  Source/YueEWorld/Public/YueEHostBridgeSubsystem.h
  Source/YueEWorld/Public/Gate0/YueEGate0GameMode.h
  Source/YueEWorld/Public/Gate0/YueEGate0SpectatorPawn.h
  Source/YueEWorld/Private/YueEHostProtocol.cpp
  Source/YueEWorld/Private/YueEHostBridgeSubsystem.cpp
  Source/YueEWorld/Private/Windows/YueENamedPipeClientWin.cpp
  Source/YueEWorld/Private/Windows/YueEWindowContractWin.cpp
  Source/YueEWorld/Private/Windows/YueEPresentHealthProbeWin.cpp
  Source/YueEWorld/Private/Gate0/YueEGate0GameMode.cpp
  Source/YueEWorld/Private/Gate0/YueEGate0SpectatorPawn.cpp
  Source/YueEWorld/Private/Tests/YueEGate0AutomationTests.cpp
  Scripts/import_gate0_assets.py
  Content/YueE/Gate0/                 # tracked binary assets via path-scoped LFS

native/windows/winforms/yue-e/
  YueEHostState.cs
  YueESession.cs
  YueEIpcProtocol.cs
  YueEStateMachine.cs
  YueENamedPipeServer.cs
  YueEJobObject.cs
  YueEProcessLauncher.cs
  YueERuntimeManifest.cs
  YueEWindowController.cs
  YueEResizeBands.cs
  YueEWebMessageProtocol.cs
  YueEWebBridge.cs
  YueEEvidenceDriverServer.cs
  UnrealWorldHost.cs

native/windows/yue-e-harness/
  FeMonster.YueEHostHarness.csproj
  Program.cs
  FakeYueEChild.cs

native/windows/yue-e-audio-probe/
  FeMonster.YueEAudioProbe.csproj
  Program.cs

web/yue-e-host-bridge.js
web/yue-e-host-bridge.css

runtime/yue-e/                         # staged packaged runtime, ignored
artifacts/yue-e/gates/G0/<buildId>/    # evidence, ignored; published separately
docs/superpowers/gates/yue-e-g0.json
```

此处是核心布局总览；每个 Task 的 **Files** 清单是全部创建/修改路径的权威来源，执行者不得因文件未出现在总览而省略 Task 文件，也不得自行添加共享 UI 或音频文件。

## Production Interfaces

```csharp
internal enum YueEHostPhase { Idle, Starting, Handshaking, Warming, ReadyHidden,
    CoveringWeb, Revealing, Active, Suspending, Suspended, Restoring,
    Covering, Exiting, Recovering, Faulted }
internal enum YueEExitReason { User, Escape, AltF4, WindowClose, MainAppClose, Fault }
internal enum YueEWebActionKind { Enter, Exit, Retry }
internal enum YueEConcealmentKind { None, Acknowledged, SystemForced }
internal enum YueEInteractiveLayoutKind {
    Move, SizeLeft, SizeRight, SizeTop, SizeBottom,
    SizeTopLeft, SizeTopRight, SizeBottomLeft, SizeBottomRight
}
internal enum YueEWindowObservationKind {
    OwnerMinimized, OwnerRestored, DwmCloaked, DwmUncloaked,
    OwnedHiddenBySystem, OwnerLayoutWillMutate,
    DisplayUnavailable, DisplayAvailable
}
internal enum YueEWindowJournalEventKind {
    HostReady, WindowAttached, PhaseChanged, VisibilityChanged,
    WindowDetached, GenerationEnded, HostClosing
}
internal readonly record struct YueESession(
    string ActivationRequestId, string SessionId, ulong ProcessGeneration);
internal readonly record struct YueEWebNavigationIdentity(
    ulong WebViewGeneration, string NavigationNonce);
internal readonly record struct YueEWebActionRequest(
    YueEWebActionKind Action, string RequestId,
    YueEWebNavigationIdentity Navigation, ulong ExpectedStateRevision,
    YueESession? ExpectedSession);
internal readonly record struct YueEWebActionResult(
    bool Accepted, YueESession? Session, ulong CurrentStateRevision, string ResultCode);
internal readonly record struct YueEWebCoverAck(
    string RequestId, YueEWebNavigationIdentity Navigation,
    YueESession Session, string Target);
internal readonly record struct YueEPrelaunchIdentity(
    string SessionId, ulong ProcessGeneration, int HostPid, string RuntimeBuildId);
internal readonly record struct YueEIpcSession(
    YueEPrelaunchIdentity Identity, int UnrealPid);
internal readonly record struct YueEIpcHeaderContext(
    string Protocol, int Major, int Minor, string SessionId, ulong ProcessGeneration);
internal sealed record YueEIpcEnvelope(
    YueEIpcHeaderContext Header, ulong Seq, string Type, string? CommandId, string? ReplyTo,
    ulong? ExpectedRevision, ulong Revision, JsonElement Payload);
internal sealed record YueEIpcOutboundMessage(
    string Type, string? CommandId, string? ReplyTo,
    ulong? ExpectedRevision, ulong Revision, JsonElement Payload);
internal sealed record YueEHostState(
    YueEHostPhase Phase, YueESession? Session, ulong WebViewGeneration,
    ulong StateRevision, ulong ConcealmentEpoch, YueEConcealmentKind Concealment,
    string? LoadedMapPackage, bool CanRetry, YueEPublicError? Error);
internal abstract record YueEWebOutboundMessage(string Type, int SchemaVersion);
internal sealed record YueELaunchRequest(
    string ExecutablePath, YueEPrelaunchIdentity Identity,
    string PipeName, string ValidatedUnrealUserRoot,
    YueEPrewarmPlacement PrewarmPlacement);
internal sealed record YueELaunchedProcess(int ProcessId, SafeProcessHandle Process);
internal readonly record struct YueEMainWindowState(
    Rectangle PhysicalClientBounds, uint DpiX, uint DpiY, bool IsVisible,
    bool IsMinimized, bool IsCloaked, bool IsDisplayAvailable,
    bool IsMaximized, bool IsFullscreen);
internal readonly record struct YueEWindowObservation(
    ulong ObservationSequence, YueEWindowObservationKind Kind,
    bool OwnerIsIconic, bool OwnerIsCloaked,
    bool OwnedIsVisible, bool DisplayAvailable);
internal readonly record struct YueEWindowJournalEntry(
    ulong Sequence, long QpcTicks, YueEWindowJournalEventKind Kind,
    YueEHostPhase Phase, string? SessionId, ulong ProcessGeneration,
    int HostPid, int? UnrealPid, ulong MainHwndValue, ulong? OwnedHwndValue,
    Rectangle PhysicalClientBounds, Rectangle? OwnedPhysicalBounds,
    bool OwnedVisible, bool OwnedCloaked);
internal readonly record struct YueEInteractiveLayoutPermit(
    ulong LayoutEpoch, YueEInteractiveLayoutKind Kind,
    long IssuedQpcTicks, long ExpiresQpcTicks);
internal readonly record struct YueEPhysicalBounds(
    Rectangle Bounds, uint DpiX, uint DpiY, ulong BoundsRevision);
internal readonly record struct YueEPrewarmPlacement(
    Rectangle PhysicalBounds, uint DpiX, uint DpiY, ulong BoundsRevision);
internal readonly record struct YueEGateEvidenceOptions(
    bool Enabled, string? ValidatedEvidenceRoot);
internal enum YueEPlayerProbeOperation { CaptureBaseline, Sample }
internal sealed record YueEPlayerProbeObservations(
    bool SameElement, bool SameSource, bool SameQueueRevision,
    ulong SourceMutationCount, double TimeDeltaMs,
    bool PausedEqual, bool RateEqual,
    ulong MediaElementSourceCount, ulong BridgePlayCount,
    ulong BridgePauseCount, ulong BridgeLoadCount, ulong BridgeSeekCount);
internal enum YueEEvidenceFaultKind { KillUnreal, BreakPipe, HeartbeatTimeout, RendererCrash }
internal sealed record YueEEvidenceStatus(
    YueEHostPhase Phase, YueESession? Session, ulong StateRevision,
    YueEWebNavigationIdentity? Navigation, string? LoadedMapPackage, string ResultCode);

internal interface IYueEWebCommandSink
{
    ValueTask<YueEWebActionResult> HandleWebActionAsync(
        YueEWebActionRequest request, CancellationToken cancellationToken);
    ValueTask HandleWebCoverAckAsync(
        YueEWebCoverAck ack, CancellationToken cancellationToken);
}

internal interface IYueEPlayerProbeClient
{
    Task ImportFixtureAndStartPlaybackAsync(
        string validatedWavPath, CancellationToken cancellationToken);
    Task<YueEPlayerProbeObservations> ProbePlayerAsync(
        YueEPlayerProbeOperation operation,
        CancellationToken cancellationToken);
}

internal interface IYueEEvidenceControlSink
{
    Task<YueEEvidenceStatus> EnterAsync(string requestId, CancellationToken cancellationToken);
    Task<YueEEvidenceStatus> ExitAsync(string requestId, CancellationToken cancellationToken);
    Task<YueEEvidenceStatus> InjectFaultAsync(
        string requestId, YueEEvidenceFaultKind fault, CancellationToken cancellationToken);
    ValueTask<YueEEvidenceStatus> GetStatusAsync(CancellationToken cancellationToken);
}

internal interface IYueEEvidenceDriver : IAsyncDisposable
{
    void AttachControlSink(IYueEEvidenceControlSink sink);
    Task StartAsync(CancellationToken cancellationToken);
    Task StopAsync(CancellationToken cancellationToken);
}

internal sealed class UnrealWorldHost : IYueEWebCommandSink, IYueEEvidenceControlSink, IDisposable
{
    public UnrealWorldHost(
        TimeProvider timeProvider,
        IYueERuntimeManifestVerifier runtimeVerifier,
        IYueEProcessLauncher processLauncher,
        IYueEJobFactory jobFactory,
        IYueEPipeServerFactory pipeFactory,
        IYueEWindowControllerFactory windowFactory,
        IYueEWindowJournal windowJournal,
        IYueEWebBridge webBridge,
        IYueEEvidenceDriver evidenceDriver,
        IYueESessionFactory sessionFactory,
        YueEGateEvidenceOptions evidenceOptions);
    public YueEHostState State { get; }
    public YueEWebNavigationIdentity BeginWebViewNavigation();
    public ValueTask<YueEWebActionResult> HandleWebActionAsync(
        YueEWebActionRequest request, CancellationToken cancellationToken);
    public ValueTask HandleWebCoverAckAsync(
        YueEWebCoverAck ack, CancellationToken cancellationToken);
    public Task RequestSystemExitAsync(
        YueEExitReason reason, CancellationToken cancellationToken);
    public Task<YueEInteractiveLayoutPermit> PrepareInteractiveLayoutAsync(
        YueEInteractiveLayoutKind kind, CancellationToken cancellationToken);
    public Task<YueEEvidenceStatus> EnterAsync(
        string requestId, CancellationToken cancellationToken);
    public Task<YueEEvidenceStatus> ExitAsync(
        string requestId, CancellationToken cancellationToken);
    public Task<YueEEvidenceStatus> InjectFaultAsync(
        string requestId, YueEEvidenceFaultKind fault, CancellationToken cancellationToken);
    public ValueTask<YueEEvidenceStatus> GetStatusAsync(
        CancellationToken cancellationToken);
    public void RequestLayout();
    public void NotifyMainWindowState(YueEMainWindowState state);
    public void InvalidateWebViewGeneration(string reason);
    public Task ShutdownAsync(CancellationToken cancellationToken);
    public void Dispose();
}

internal static class YueEIpcProtocol
{
    public const int MaxFrameBytes = 1024 * 1024;
    public static ValueTask<YueEReadFrameResult> ReadFrameAsync(
        Stream stream,
        CancellationToken cancellationToken);
    public static bool TryDecodePayload(
        ReadOnlySpan<byte> json,
        in YueEIpcSession expected,
        YueEInboundSequenceState inbound,
        out YueEIpcEnvelope? envelope,
        out YueEProtocolError error);
    public static ValueTask<ulong> WriteFrameAsync(
        Stream stream,
        in YueEIpcHeaderContext header,
        YueEIpcOutboundMessage message,
        YueEOutboundSequenceState outbound,
        CancellationToken cancellationToken);
}

internal interface IYueEProcessLauncher
{
    YueELaunchedProcess LaunchVerified(YueELaunchRequest request, IYueEJob job);
}

internal interface IYueEJob : IDisposable
{
    void AssignBeforeResume(SafeProcessHandle process);
    void Terminate(uint exitCode);
}

internal interface IYueEJobFactory
{
    IYueEJob CreateKillOnCloseJob();
}

internal interface IYueEPipeServer : IAsyncDisposable
{
    public string PipeName { get; }
    public Task<YueEPeer> AcceptVerifiedPeerAsync(
        YueEExpectedPeer expected,
        CancellationToken cancellationToken);
    public ValueTask SendAsync(
        YueEIpcOutboundMessage message,
        CancellationToken cancellationToken);
}

internal interface IYueEPipeServerFactory
{
    IYueEPipeServer Create(YueEPrelaunchIdentity identity);
}

internal sealed class YueENamedPipeServer : IYueEPipeServer { /* production implementation */ }

internal interface IYueEWindowController : IAsyncDisposable
{
    public event EventHandler<YueEWindowObservation> SystemObservation;
    public Task<nint> AttachOwnedTopLevelAsync(
        int processId, nint ownerHwnd, YueEPrewarmPlacement prewarm,
        CancellationToken cancellationToken);
    public YueEWindowObservation QuerySystemObservation();
    public YueEWindowObservation ConcealBeforeUnpreparedOwnerMutation(
        YueEMainWindowState pendingState);
    public void LatchHiddenForSystemRestore(ulong concealmentEpoch);
    public void ReleaseHiddenLatchAfterOpaque(ulong concealmentEpoch);
    public void QueueBounds(YueEPhysicalBounds physicalBounds);
    public void ShowAfterSafeFrames();
    public void Hide();
    public void RestoreFocus();
}

internal interface IYueEWindowControllerFactory
{
    IYueEWindowController Create(nint mainWindowHwnd);
}

internal interface IYueEWindowJournal : IAsyncDisposable
{
    public string LaunchId { get; }
    public ValueTask AppendAsync(
        YueEWindowJournalEntry entry, CancellationToken cancellationToken);
    public ValueTask CompleteAsync(CancellationToken cancellationToken);
}

internal interface IYueEWebBridge : IYueEPlayerProbeClient
{
    public void AttachCommandSink(IYueEWebCommandSink sink);
    public Task PostAsync(
        YueEWebOutboundMessage message,
        CancellationToken cancellationToken);
    public Task CrashRendererForEvidenceAsync(CancellationToken cancellationToken);
}

internal sealed class YueEWebBridge : IYueEWebBridge
{
    public void AttachCommandSink(IYueEWebCommandSink sink);
    public ValueTask<YueEWebDispatchResult> HandleMainMessageAsync(
        CoreWebView2 sender,
        CoreWebView2WebMessageReceivedEventArgs args,
        bool navigationReady,
        CancellationToken cancellationToken);
    public Task PostAsync(
        YueEWebOutboundMessage message,
        CancellationToken cancellationToken);
    public Task ImportFixtureAndStartPlaybackAsync(
        string validatedWavPath, CancellationToken cancellationToken);
    public Task<YueEPlayerProbeObservations> ProbePlayerAsync(
        YueEPlayerProbeOperation operation,
        CancellationToken cancellationToken);
    public Task CrashRendererForEvidenceAsync(CancellationToken cancellationToken);
}
```

`YueEReadFrameResult`、sequence states、peer/errors、dispatch/evidence options 和 factories 都必须是实际生产类型。Header context carries every fixed wire header; outbound state alone allocates seq. Decoded envelope is inbound, outbound is seq-free. `SendAsync` has no caller-supplied priority：a canonical type registry assigns the one legal lane and rejects unknown types. After depth/size validation, decoder clones `JsonElement` into owned immutable data before disposing its source `JsonDocument`; outbound construction likewise clones/owns payload before any async queue. Harness disposes source documents then proves queued decode/write remains valid. 启动顺序固定为 prelaunch identity → pipe/header + single Job → suspended launch/assign → PID/full peer → verified accept。Job 仅 Host 持有，超时从 `TimeProvider` 派生。

`LoadedMapPackage` is null before a verified UE hello and after generation cleanup. The same transition-gate mutation that accepts hello sets it to the one exact `/Game/YueE/Gate0/L_YueE_Gate0` value for that generation; it remains immutable through Warming/Revealing/Active/suspend/exit and is cleared before the generation is detached. `YueEEvidenceStatus` copies only this typed Host field—never a driver-supplied value. Fake and real status-schema tests require Active to carry the exact package, require every state without an accepted generation to carry null, and reject a missing/alternate/additional map field.

`HandleMainMessageAsync` parses/validates and dispatches only through the attached `IYueEWebCommandSink`. Host performs receipt replay, navigation/session comparison and expected-state-revision handling in the exact precedence above **inside the same transition gate** that mutates state; bridge prevalidation is not authority. In particular, a cached identical exit may replay after Idle before current-session comparison, whereas a new Idle exit is structural no-op only. `HandleWebCoverAckAsync` resolves only the exact pending cover request. `AttachCommandSink` is one-shot before message subscription, rejecting null/second attachment, which breaks the construction cycle without a global singleton. `ProbePlayerAsync` snapshots the bridge's current approved ready navigation internally and owns a bounded pending-request table keyed by `replyTo + evidenceNonce + navigation tuple`; stale/duplicate/late replies are rejected and navigation invalidation/dispose cancels every waiter. `ImportFixtureAndStartPlaybackAsync` uses that same current navigation, is evidence-only and drives the real file input plus real first-song UI click; it is not exposed by production Web messages.

`FeMonsterForm` composes `YueEEvidenceDriverServer(TimeProvider, YueEGateEvidenceOptions, IYueEPlayerProbeClient)` only in an internal-evidence build and otherwise injects `YueEDisabledEvidenceDriver`, which creates no pipe/bootstrap. The Web bridge attaches `IYueEWebCommandSink`; the evidence driver separately attaches `IYueEEvidenceControlSink`, each exactly once after Host construction. Evidence enter/exit/fault/status are typed Host methods serialized by the same transition gate; the driver never fabricates a Web navigation/session tuple. Wire faults map exactly as `process-kill→KillUnreal`, `pipe-break→BreakPipe`, `heartbeat-timeout→HeartbeatTimeout`, `renderer-crash→RendererCrash`; only `RendererCrash` delegates to `IYueEWebBridge.CrashRendererForEvidenceAsync`, which is compiled out/rejected when internal evidence is false. The server contains only ACL/framing/command routing and depends on typed control/probe/import interfaces—no direct WebView2/CDP or Host construction. Harnesses inject fakes for driver and probe so normal-build absence, start/stop, cancellation and correlation are testable.

`YueEResizeBands` 使用 8 个同 owner 的窄顶层命中带独占 UE 最外侧物理像素，按当前 PerMonitorV2 DPI 映射为 `HTLEFT/HTRIGHT/HTTOP/HTBOTTOM/HT*CORNER`。左键按下只发起 `PrepareInteractiveLayoutAsync`；matching suspend ack 后 Host 已隐藏 UE，返回一次性短时 permit，命中带才向主 WinForms HWND 发送受限 `WM_NCLBUTTONDOWN`。主窗自绘标题拖动走同一 Move permit。失败/超时取消本次手势且绝不移动 owner。该窄环不尝试把命中“穿透”到跨进程 UE；验收只证明内部内容区域的 UE 鼠标/键盘输入不被抢走。最大化、应用全屏、最小化或 UE 隐藏时必须隐藏全部命中带。

## Task 1: Isolate the Worktree and Lock the Toolchain

**Files:**

- Create: `.gitattributes`
- Modify: `.gitignore`
- Create: `scripts/yue-e/local-config.example.json`
- Create: `scripts/yue-e/toolchain-lock.json`
- Create: `scripts/yue-e/check-yue-e-toolchain.ps1`
- Create: `scripts/yue-e/provision-build-dependencies.ps1`
- Create: `scripts/yue-e/gate-child-environment.ps1`
- Create: `scripts/yue-e/invoke-yue-e-node-script.ps1`
- Create: `scripts/yue-e/invoke-yue-e-git.ps1`
- Create: `scripts/yue-e/locked-node-child-process-hook.mjs`
- Create: `scripts/yue-e/invoke-yue-e-dotnet-project.ps1`
- Create: `scripts/yue-e/build-tools/package.json`
- Create: `scripts/yue-e/build-tools/package-lock.json`
- Create: `global.json`
- Create: `scripts/yue-e/nuget-online.config`
- Create: `scripts/yue-e/dotnet-runtime-pack-lock.json`
- Create: `scripts/yue-e/kugou-runtime-package.json`
- Create: `scripts/yue-e/kugou-runtime-package-lock.json`
- Create: `contracts/yue-e/provision-receipt-v1.schema.json`
- Create: `native/windows/winforms/packages.lock.json`
- Create: `native/windows/setup/packages.lock.json`
- Create: `native/windows/edge-harness/packages.lock.json`
- Create: `native/windows/startup-harness/packages.lock.json`
- Modify: `native/windows/winforms/FeMonsterClient.WinForms.csproj`
- Modify: `native/windows/setup/FeMonsterSetup.csproj`
- Modify: `native/windows/edge-harness/FeMonster.EdgeHarness.csproj`
- Modify: `native/windows/startup-harness/FeMonster.StartupHarness.csproj`
- Create: `scripts/check-yue-e-baseline.mjs`
- Create: `scripts/check-yue-e-toolchain-contract.mjs`
- Create: `rust-toolchain.toml`
- Create: `music-api-plugins/netease/runtime-package-lock.json`
- Create: `music-api-plugins/qq/runtime-package-lock.json`
- Modify: `music-api-plugins/netease/build.ps1`
- Modify: `music-api-plugins/qq/build.ps1`
- Modify: `music-api-plugins/kugou/build.ps1`
- Modify: `music-api-plugins/qishui/build.ps1`
- Modify: `scripts/build-java.ps1`
- Modify: `scripts/build-xaudio2.ps1`
- Modify: `scripts/build-installer.ps1`
- Modify: `scripts/build-winforms-client.ps1`
- Local only: `.yue-e-local.json` (ignored; never staged)

- [ ] **Step 1: Audit the source baseline read-only and stop on dirty required paths.**

Task 1 Steps 1-2 have the only controller-Git bootstrap exception because `.yue-e-local.json` does not exist yet. Before the first shown Git command, the controller resolves the current `git.exe` and `git-lfs.exe` once to absolute ordinary-file paths, parses their product versions, computes both SHA-256 values and keeps those four identities only in process memory. It then runs only the shown local `rev-parse`, `cat-file`, `diff`, `status` and `worktree` verbs through that exact Git executable with an empty temporary HOME/global config, `GIT_CONFIG_NOSYSTEM=1`, an empty hooks directory, disabled credentials/rewrites/proxy/prompt/signing and no repository filter execution. The temporary controller directory is outside the source tree and is removed only after its exact resolved path is revalidated. No network verb, commit, stage or dependency checkout is permitted in this bootstrap mode. Every literal `git` token in Steps 1-2 denotes that bootstrap controller invocation, not ambient PATH lookup.

From `E:\FE moster`, do not edit/stage. Record status for the five Web sources, `web/data/storm-ocean-preset.json`, entire `web/assets/soundscape-workshop/`, this plan and the formal spec; confirm approved map source. The baseline is admissible only when one confirmed commit tracks the plan/spec, all seven Workshop closure files, all other required files, exact 11 built-ins, bundled scene and dynamic protocol. Inspect every path with `git show HEAD:<path>`.

Expected on the currently observed workspace: stop with `BaselineCommitRequired`; identify only the required dirty/untracked paths and explain that the source owner must commit/confirm them. Do **not** run `git add`, copy whole files, create a worktree from old `HEAD`, or proceed to Step 2. Resume this task only after that external baseline commit exists.

- [ ] **Step 2: Freeze `YUEE_BASE_COMMIT` and create a clean worktree.**

After the source owner confirms the commit, set a PowerShell variable for this shell only, validate it is a full 40-hex commit and that the five UI paths are tracked/clean at that commit, then create the worktree from that exact commit:

```powershell
$YueEBaseCommit = (git rev-parse HEAD).Trim()
if ($YueEBaseCommit -notmatch '^[0-9a-f]{40}$') { throw 'BaselineCommitInvalid' }
$YueERequired = @(
  'web/index.html', 'web/app.js', 'web/styles.css', 'web/app-command.js',
  'web/soundscape-runtime.js', 'web/data/storm-ocean-preset.json',
  'web/assets/soundscape-workshop/runtime.html',
  'web/assets/soundscape-workshop/bridge.js',
  'web/assets/soundscape-workshop/assets/index-DgmMz9-g.css',
  'web/assets/soundscape-workshop/assets/index-CSU_B_T9.js',
  'web/assets/soundscape-workshop/preview.gif',
  'web/assets/soundscape-workshop/project.json',
  'web/assets/soundscape-workshop/index.html',
  'docs/superpowers/plans/2026-08-22-yue-e-gate-0-engine-host-entry.md',
  'docs/superpowers/specs/2026-08-21-yue-e-open-world-scene-design.md'
)
foreach ($YueEPath in $YueERequired) {
  git cat-file -e "${YueEBaseCommit}:$YueEPath"
  if ($LASTEXITCODE -ne 0) { throw "BaselineBlobMissing:$YueEPath" }
}
git diff --quiet $YueEBaseCommit -- $YueERequired
if ($LASTEXITCODE -ne 0) { throw 'BaselineCommitRequired' }
$YueEDirtyRequired = @(git status --porcelain=v1 --untracked-files=all -- $YueERequired)
if ($YueEDirtyRequired.Count -ne 0) { throw 'BaselineCommitRequired' }
git worktree add -b codex/yue-e-gate-0 '..\FE moster-yue-e-g0' $YueEBaseCommit
Set-Location '..\FE moster-yue-e-g0'
git status --short
```

Expected: the Gate worktree is clean and its `HEAD` equals the confirmed baseline commit. If the branch/path exists, verify both facts and reuse it; never delete or overwrite an existing worktree automatically.

- [ ] **Step 3: Write the failing baseline/toolchain contract probes.**

`check-yue-e-baseline.mjs` accepts `--root --config`, resolves full `baselineCommit`, uses `git show` rather than worktree bytes, and checks preset/protocol union, all required tracked paths, this plan SHA/Git blob and formal spec blob. It rejects dirty/missing protected baseline paths with `BaselineCommitRequired`.

`check-yue-e-toolchain-contract.mjs` must fail until the lock/example/ignore files exist, and then require this exact semantic lock:

```json
{
  "schema": "yue-e.toolchain-lock/v1",
  "blender": {
    "version": "5.2.0",
    "channel": "LTS",
    "platform": "windows-x64-portable",
    "archiveName": "blender-5.2.0-windows-x64.zip",
    "archiveUrl": "https://download.blender.org/release/Blender5.2/blender-5.2.0-windows-x64.zip",
    "archiveSha256": "2d184b626c001692c362291911293b6a297179d618d95e9e9192c3a80318adc4"
  },
  "unreal": { "major": 5, "minor": 8, "patch": 0, "changelist": 55116800 },
  "visualStudio": { "major": 17, "workload": "Microsoft.VisualStudio.Workload.NativeGame" },
  "windowsSdk": "10.0.26100.0",
  "dotnetSdk": "8.0.422",
  "node": { "version": "24.17.0", "npm": "11.13.0" },
  "java": { "vendor": "Eclipse Adoptium", "version": "17.0.19" },
  "rust": {
    "toolchain": "1.89.0-x86_64-pc-windows-msvc",
    "rustc": "1.89.0",
    "cargo": "1.89.0"
  },
  "buildSources": {
    "kugou": {
      "repository": "https://github.com/MakcRe/KuGouMusicApi.git",
      "commit": "283f1e97b110726b208a64b486a657c0fc0a6126",
      "packageVersion": "1.5.1"
    },
    "googleObr": {
      "repository": "https://github.com/google/obr.git",
      "commit": "478dc7c752d5eccae534635139ff0253eee3a14a"
    },
    "esbuild": { "version": "0.28.1" }
  },
  "target": { "platform": "Win64", "rhi": "DirectX12" }
}
```

It also asserts path-scoped LFS and that none of the three character PNG paths are remapped. Before local config exists, run only the config-independent toolchain contract probe and confirm RED because the new lock/example/ignore files do not exist; do not let an expected `ConfigMissing` mask that RED.

```powershell
$YueEToolchainContractRed = node .\scripts\check-yue-e-toolchain-contract.mjs --root . 2>&1 | Out-String
$YueEToolchainContractRedExit = $LASTEXITCODE
if ($YueEToolchainContractRedExit -eq 0) { throw 'ExpectedToolchainContractRed' }
if ($YueEToolchainContractRed -notmatch 'ToolchainContractMissing' -or
    $YueEToolchainContractRed -match 'SyntaxError|ERR_MODULE_NOT_FOUND|ConfigMissing') {
  throw 'UnexpectedToolchainContractRed'
}
```

Expected: stable `ToolchainContractMissing`, not an unrelated stack trace. The checker emits that token only after it has loaded successfully and enumerated the intentionally absent lock/example/ignore contracts.

- [ ] **Step 4: Add local-config schema, lock, ignore rules and path-scoped LFS.**

`scripts/yue-e/local-config.example.json` is committed with empty placeholder paths/hashes and these exact keys: `schema`, `approvalSourceRoot`, `blenderExecutable`, `blenderExecutableSha256`, `unrealInstallRoot`, `visualStudioInstallRoot`, `edgeExecutable`, `nodeExecutable`, `npmExecutable`, `dotnetExecutable`, `dotnetExecutableSha256`, `gitExecutable`, `gitExecutableSha256`, `gitLfsExecutable`, `gitLfsExecutableSha256`, `javaHome`, `cargoExecutable`, `rustcExecutable`, `baselineCommit`. Copy it locally to `.yue-e-local.json`, populate real absolute paths plus full baseline commit, and add `/.yue-e-local.json` to `.gitignore`; never print or commit it. The four Git/Git-LFS path/hash fields must exactly equal the in-memory Step 1 bootstrap identities; the first `BootstrapContract` wrapper invocation compares them and rejects any mismatch before it launches a checker, after which bootstrap mode is permanently disabled and every controller Git command uses the formal isolated contract below. Provisioned third-party source/tool paths are deterministic beneath ignored `.tools/yue-e/` and are never accepted from ambient `node_modules`, NuGet caches or `PATH`.

Add the exact lock above. Add root `global.json` with SDK `8.0.422`, `rollForward:"disable"` and `allowPrerelease:false`; every Gate .NET invocation resolves from this file and rejects a selected SDK other than exactly `8.0.422`. `.gitattributes` applies LFS only to:

```gitattributes
art/blender/yue-e/**/*.blend filter=lfs diff=lfs merge=lfs -text
art/blender/yue-e/**/*.fbx filter=lfs diff=lfs merge=lfs -text
unreal/YueEWorld/Content/YueE/**/*.uasset filter=lfs diff=lfs merge=lfs -text
unreal/YueEWorld/Content/YueE/**/*.umap filter=lfs diff=lfs merge=lfs -text
docs/superpowers/assets/yue-e/ui-baselines/*.png filter=lfs diff=lfs merge=lfs -text
scripts/fixtures/yue-e-transition/*.mp4 filter=lfs diff=lfs merge=lfs -text
```

Do not add repository-wide binary rules. Add UE `Binaries/`, `Intermediate/`, `Saved/`, `DerivedDataCache/`, `/unreal/YueEWorld/.vs/` and `/unreal/YueEWorld/*.sln`; add the four exact rules `/native/windows/yue-e-harness/bin/`, `/native/windows/yue-e-harness/obj/`, `/native/windows/yue-e-audio-probe/bin/`, `/native/windows/yue-e-audio-probe/obj/`; also add `/.tools/yue-e/`, Blender temp/cache, `runtime/yue-e/`, `out/yue-e/` and generated Gate evidence rules while preserving existing ignores. Immediately after the existing global `*.mp4` ignore, add the one narrow exception `!/scripts/fixtures/yue-e-transition/pass-1920x1080-60.mp4`; no other recording is unignored. Gate 0 FBX files are content-validated exchange assets, tracked through LFS, but their bytes are not claimed reproducible across exporter runs. The contract probe must assert every required baseline path exists as a blob at `baselineCommit`, assert `git check-ignore` covers generated .NET/UE/evidence/tool paths, and require `git check-ignore --quiet --no-index scripts/fixtures/yue-e-transition/pass-1920x1080-60.mp4` to return nonzero while `git check-attr filter` returns `lfs`; no other authoritative source/reference file may be ignored.

- [ ] **Step 5: Implement strict machine probing.**

`check-yue-e-toolchain.ps1` accepts `-Root -Config -JsonOutput` and obtains every local path only from the config. It must:

- require the exact official Blender archive URL/name/hash from the lock, verify archive SHA-256 before extraction, compute the extracted `blender.exe` SHA-256 into local config, recheck that executable hash and version/build identity on every run; invoke only with `--factory-startup --disable-autoexec --background` and isolated portable configuration;
- parse UE `Engine/Build/Build.version` and require 5.8.0 / CL 55116800;
- validate the configured Visual Studio root directly as a 17.x instance with `Microsoft.VisualStudio.Workload.NativeGame`, MSVC v143 x64 tools and its bundled CMake; a co-installed 18.x/VS2026 must not be selected by `vswhere -latest`;
- require configured Node 24.17.0/npm 11.13.0, hash-bound absolute Git and Git LFS executables with their product versions, Eclipse Adoptium JDK/javac 17.0.19, rustc/Cargo 1.89.0 for `1.89.0-x86_64-pc-windows-msvc`, Windows SDK 10.0.26100.0, the configured absolute `dotnetExecutable` whose SHA-256 matches local config and selects only root `global.json` SDK 8.0.422, the complete required installed host/reference-pack inventory, Win64 and DX12 build tools;
- verify configured Microsoft Edge executable exists, is a valid signed Windows binary, and record its product version for screenshot/video evidence;
- enumerate `QDC_ONLY_ACTIVE_PATHS | QDC_VIRTUAL_MODE_AWARE` with `QueryDisplayConfig`, correlate each desktop target to an `HMONITOR`, reject HMD/indirect/virtual-only outputs, and read effective DPI; require at least two simultaneously active targets with different `(dpiX,dpiY)` values. Emit `MixedDpiMonitorPairMissing` when this real pair is absent. A synthetic monitor provider is allowed only in `-SelfTest` to test error logic and can never make the real preflight green;
- emit machine-readable result codes without logging user paths beyond sanitized tool labels.

The script validates the full baseline commit and approved source root too. It exits `2` for missing/mismatched prerequisites, `3` for `BaselineCommitRequired`, and `1` for malformed config/lock/probe errors.

`scripts/yue-e/kugou-runtime-package.json` is a dependency-only package with the locked upstream's complete ten-name dependency set and these exact, non-range pins: `axios: 1.18.1`, `big-integer: 1.6.52`, `crypto-js: 4.2.0`, `dotenv: 16.6.1`, `express: 4.22.2`, `node-forge: 1.4.0`, `pako: 2.2.0`, `qrcode: 1.5.4`, `safe-decode-uri-component: 1.2.1`, and `url: 0.11.4`. `kugou-runtime-package-lock.json` is npm lockfile v3 generated by configured npm 11.13.0 and pins every transitive version/integrity. The contract checker compares the direct-name set with the exact upstream `package.json` dependency-name set, proves each exact pin satisfies its upstream semver range, rejects ranges/git/file links/scripts and validates every lock integrity entry. This tracked lock—not the upstream repository, which has no lockfile—is the sole Kugou dependency authority.

`provision-build-dependencies.ps1` creates persistent bytes only beneath ignored `.tools/yue-e/` with this fixed layout: Kugou exact detached clone at `.tools/yue-e/kugou/source`, its dependency root at `.tools/yue-e/kugou`, Google OBR at `.tools/yue-e/sources/google-obr`, esbuild tooling at `.tools/yue-e/build-tools`, npm cache/config at `.tools/yue-e/npm-cache` and `.tools/yue-e/npm-config`, and Cargo cache at `.tools/yue-e/cargo-home`. It rejects dirty/incomplete clones, validates Kugou `package.json` version 1.5.1 and exact OBR/Kugou commits, copies the two tracked dependency-only package files to the Kugou dependency root as `package.json/package-lock.json`, then invokes the configured Node executable with the preflight-resolved configured npm CLI JS to run `npm ci --ignore-scripts --no-audit --no-fund --cache=<validated npm-cache> --userconfig=<validated empty user.npmrc> --globalconfig=<validated empty global.npmrc>` there. It clears inherited `NPM_CONFIG_*`/`NODE_PATH`, sets npm temp to a contained per-run directory, and deletes only that validated temp after exit; poisoned machine/user npmrc and ambient caches cannot influence the result. Because the verified source checkout is the dependency root's direct `source/` child, esbuild's normal upward resolution is deterministically limited to that parent `node_modules`; the provisioner and build script reject any resolved bare module outside this root and bind the resulting inventory hash. It separately runs the same configured Node/npm pair with the same contained cache/config rules against `scripts/yue-e/build-tools/package-lock.json` to provision exact esbuild 0.28.1. Npm cache/log/last-use bytes are mutable non-authoritative data and are excluded from the receipt; no `npx`, ambient npm shim, ambient `node_modules` or install in the source checkout is allowed.

`invoke-yue-e-git.ps1` exports `Invoke-YueEGateGit -Root -Config -Mode <Bootstrap|Provisioned> -Operation <CloneDetached|FetchCommit|VerifyTree> -SourceId <Kugou|GoogleObr> [-Destination]`. It resolves the Git executable, fixed HTTPS remote and exact commit/tree only from config/toolchain lock; Bootstrap verifies config hash/version before a receipt exists, while Provisioned additionally verifies the receipt identity. Every operation calls `Invoke-YueEGateChildProcess -Kind Git -GitPolicy Dependency` with a contained empty HOME/XDG/config, `GIT_CONFIG_NOSYSTEM=1`, disabled hooks/templates/filters/credentials, HTTPS-only protocol, no URL rewrites/proxy/prompt and an empty PATH except validated Git/Git-LFS/System32 parents. Destination must be an absent reparse-free child of the fixed `.tools/yue-e` layout. Provisioning performs every clone/fetch/status/rev-parse/tree check through this entry. Self-tests poison system/global/repository config, `insteadOf`, proxy, credential helper, template, hook, filter, SSH and PATH shims and prove none runs or redirects/writes.

The .NET closure is equally explicit. Add `<RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>` and reviewed `packages.lock.json` files for the existing WinForms, setup, edge-harness and startup-harness projects; WinForms locks `Microsoft.Web.WebView2 1.0.4022.49` and its exact NuGet `contentHash`, and each lock includes the applicable `net8.0[-windows]/win-x64` graph. The later zero-`PackageReference` YueE host harness and audio probe also set lock-file restore and commit their empty applicable dependency graphs; adding either lock requires rerunning provision so the receipt binds the current complete project-lock set before any consumer runs. `scripts/yue-e/dotnet-runtime-pack-lock.json` additionally pins the self-contained publish nupkgs `Microsoft.NETCore.App.Runtime.win-x64 8.0.28` and `Microsoft.WindowsDesktop.App.Runtime.win-x64 8.0.28` plus every other RID pack that an offline locked restore actually requests, with package ID/version/SHA-512/SHA-256; the contract rejects a package not justified by the restore graph. The configured .NET SDK 8.0.422's required installed host/reference pack directories are inventoried separately in the receipt.

Provision creates `.tools/yue-e/nuget-feed`, `nuget-packages`, `nuget-http-cache`, `dotnet-cli-home` and `nuget-config`. It accepts downloads only from the one HTTPS v3/flat-container origin frozen by tracked `nuget-online.config`, derives exact lowercase package URLs from the complete union of every currently tracked authoritative project `packages.lock.json` plus `dotnet-runtime-pack-lock.json`, rejects redirects off that origin, validates nupkg SHA-512/contentHash, SHA-256, nuspec ID/version, signatures and ZIP path safety, then writes the unchanged nupkgs to the local feed. It generates an offline `NuGet.Config` with `<clear/>` and only that reparse-free feed. Through the configured absolute `dotnet.exe`, it restores every project with `--locked-mode --packages <contained nuget-packages> --configfile <offline config>` and `-r win-x64` where applicable, with network disabled and all NuGet caches contained. Gate publish always performs this receipt-validated offline locked restore first and then invokes `dotnet publish --no-restore`; `build-winforms-client.ps1`, the setup publish inside `build-installer.ps1`, and harness builds must bypass the existing ambient `native/windows/packages`, unverified `install-webview2-sdk.ps1`, bare `dotnet`, and online `--source` branches when `-RequireProvisionedDependencies` is set. `invoke-yue-e-dotnet-project.ps1` is the only direct project build/run entry used by Gate steps: it accepts `-Root -Config -Project -Operation <Build|Run> -Configuration`, typed `-AppMode <None|All|Suite|SelfTest>`, optional `-Suite`, and a disjoint `-SelfTest` parameter set; validates the current receipt/project lock/global.json, performs the contained offline locked restore, then calls `Invoke-YueEGateChildProcess -Kind DotNet` for `build|run --no-restore` without concatenating arguments. Legacy non-Gate behavior remains available. A clean-cache self-test removes only a validated copy of `nuget-packages`, poisons user/machine NuGet configs and blocks network, then proves WinForms plus self-contained setup restore/publish and both zero-package harnesses from the local feed, and fails on nupkg/lock/runtime-pack/SDK-pack drift.

For Rust, provision and Gate builds scope only `CARGO_HOME=<Root>/.tools/yue-e/cargo-home` in their child process, never repoint `RUSTUP_HOME`, and run configured Cargo 1.89.0 `fetch --locked --manifest-path <Root>/native/rust-audio-upmix/Cargo.toml`, then `cargo vendor --locked --versioned-dirs --manifest-path <Root>/native/rust-audio-upmix/Cargo.toml <Root>/.tools/yue-e/cargo-vendor`. Gate builds use `--locked --offline` plus explicit source replacement to that receipt-bound vendor directory. The mutable Cargo home is only a contained cache: receipt validation deliberately ignores `.global-cache`, `.package-cache*`, registry last-use/access metadata and any other Cargo-maintained cache database, while the complete ordinary-file inventory of read-only `cargo-vendor/` and tracked `Cargo.lock` is authoritative. The Netease and QQ builds gain tracked runtime lockfiles plus required Gate parameters for configured Node/npm CLI, contained npm cache/user/global config and provision receipt. Each copies its tracked runtime package manifest and `runtime-package-lock.json` into a unique contained generated build root as the standard matching `package.json`/`package-lock.json`, then invokes the configured Node/npm pair with the same contained cache/config rules and `npm ci --ignore-scripts --no-audit --no-fund`; it never mutates the source plugin or uses unlocked `npm install`. Kugou `build.ps1` gains mandatory `-UpstreamSourceDir -KugouDependencyRoot -EsbuildExecutable -ProvisionReceipt` and verifies the exact parent/source layout, receipt-bound source tree/dependency inventory and every esbuild resolution before bundling.

Qishui `build.ps1` gains mandatory Gate parameters `-Root -GeneratedRoot -OutputRoot -RequireProvisionedDependencies -SelfTest`. In Gate mode it never touches the legacy fixed `.build` or `dist/plugins` paths: it resolves one absent run directory beneath validated `out/yue-e/plugin-builds/qishui/<32hex>`, rejects reparse points on every ancestor, writes/copies only inside that run, and publishes the final ZIP only into the validated installer staging root supplied by `build-installer.ps1`. Cleanup re-resolves the exact run root, proves containment/identity and removes only it. Self-tests place junctions at legacy `.build`, `dist` and generated ancestors plus outside sentinels and prove zero outside writes/deletes. Legacy non-Gate behavior remains unchanged.

`contracts/yue-e/provision-receipt-v1.schema.json` uses `additionalProperties:false` throughout and fixes the JCS receipt shape to `{schema,rootLayout,baselineCommit,toolchainLockSha256,tools,sources,packages}`. `rootLayout` is exactly `.tools/yue-e`; `baselineCommit` is permanently the confirmed `config.baselineCommit`/`YUEE_BASE_COMMIT`, not the later implementation `HEAD`. `tools` contains `{node:{version,executableSha256},npm:{version,cliSha256},dotnet:{sdkVersion,executableSha256,globalJsonSha256,requiredInstalledPacksInventorySha256},java:{vendor,version,javaSha256,javacSha256,jarSha256,jdepsSha256,jlinkSha256},cargo:{version,executableSha256},rustc:{version,executableSha256}}`; `sources` contains `kugou:{repository,commit,tree,packageVersion,sourceRoot,sourceInventorySha256}` and `googleObr:{repository,commit,tree,sourceRoot,sourceInventorySha256}`; `packages` contains `buildTools:{root,packageJsonSha256,packageLockSha256,nodeModulesInventorySha256,esbuildExecutable,esbuildSha256}`, `kugouRuntime:{root,packageJsonSha256,packageLockSha256,nodeModulesInventorySha256}`, `nuget:{feedRoot,globalPackagesRoot,httpCacheRoot,cliHomeRoot,pluginCacheRoot,configPath,onlineConfigSha256,offlineConfigSha256,projectLockSetSha256,runtimePackLockSha256,feedInventorySha256,globalPackagesInventorySha256}`, and `cargo:{home,vendorRoot,cargoLockSha256,vendorInventorySha256}`. Every inventory SHA is SHA-256 over one JCS array sorted by normalized ordinal `/` path with exact entries `{path,size,sha256}`; the installed-pack array is the same canonical shape over only the exact SDK/host/reference-pack files required by the locked build, source arrays contain all ordinary checkout files except `.git/`, and NuGet feed/global-packages, npm-package and Cargo-vendor arrays contain every ordinary file and reject symlink/reparse entries. Mutable NuGet CLI-home/plugin/HTTP-cache, npm and Cargo cache metadata is never included in an authoritative inventory. Every `root/sourceRoot/home/vendorRoot/feedRoot/globalPackagesRoot/httpCacheRoot/cliHomeRoot/pluginCacheRoot/configPath/esbuildExecutable` value is a normalized repository-relative path beneath `.tools/yue-e/`, never an absolute/private path. Every consumer resolves it against its validated `-Root`, rejects reparse/out-of-root paths and rechecks the matching SDK/global.json/lock/feed/package/vendor/source identities; no consumer invents a path field or trusts the receipt without schema/JCS validation. Later staging requires `receipt.baselineCommit == config.baselineCommit` and `receipt.toolchainLockSha256 == SHA-256(current unchanged toolchain-lock bytes)` plus all tool/package/source/vendor inventories; candidate `HEAD` is recorded separately only as the full-build/source commit.

`build-xaudio2.ps1` gains Gate parameters `-VisualStudioInstallRoot -CargoExecutable -RustcExecutable -ObrSourceDir -JavaHome -CargoHome -CargoVendorRoot -ProvisionReceipt -RequireProvisionedDependencies`. In required mode it validates the receipt/schema and relative-path containment, VS major 17 before selecting generator `Visual Studio 17 2022`, Cargo 1.89.0 plus the explicit rustc 1.89.0 path/hash against config and receipt, the exact clean OBR commit/tree, receipt-bound immutable Cargo vendor closure, and JDK/javac 17.0.19 plus JNI headers beneath only `-JavaHome`; it never invokes `vswhere -latest`, ambient `javac`, ambient Cargo/rustc or an unbound dependency source. It resolves VS17's bundled `cmake.exe`, MSBuild, v143 and Windows SDK 10.0.26100.0 from the configured root and invokes configuration/build/compiler/link children only through `Invoke-YueEGateChildProcess -Kind Native`; Cargo uses `--locked --offline` through `Kind Cargo` with `RUSTC` set only from validated `-RustcExecutable` with scoped `CARGO_HOME`, explicit vendor source replacement and no `RUSTUP_HOME` override. `build-installer.ps1` gains `-BuildConfig -RequireProvisionedDependencies`, loads the same ignored config/receipt, resolves every receipt-relative path against `-Root`, and passes explicit configured Node/npm CLI, contained npm cache/config, configured dotnet/NuGet feed, Kugou/dependency/esbuild, VS17, Java, Cargo/rustc executables, Cargo home/vendor and OBR values to every plugin/child build. In Gate mode it scopes `JAVA_HOME` and prepends only `<javaHome>/bin` for Java/JNI child processes, invokes npm only as configured Node + receipt-bound npm CLI JS, forces StagePayload/JDK discovery to the same configured JDK, and performs setup/WinForms/harness offline locked restore then publish/build `--no-restore` through `Kind DotNet`; no Gate branch calls bare `dotnet` or the legacy WebView2 installer. The full-build receipt records actual Node/npm, dotnet SDK/muxer/global.json/NuGet lock+feed+installed-pack identities, `java/javac/jar/jdeps/jlink`, VS17/CMake/MSBuild/v143/SDK identities and every non-WinForms output hash. Gate mode fails if any explicit dependency is missing or differs; legacy non-Gate invocations retain existing behavior. Self-tests cover co-installed VS17/VS18 with VS17 selected, missing/dirty Kugou, dependency lock/inventory drift, wrong OBR/Rust/vendor/npm/esbuild/JDK/dotnet/SDK pack, poisoned npmrc/NuGet config/default caches with all four plugin and .NET builds still confined, ambient-only dependency rejection, mutable Cargo last-use metadata changing across builds without invalidating the vendor receipt, vendor-byte tampering, and receipt-field/path drift.

`scripts/build-java.ps1` gains `-JavaHome -RequirePinnedJava -SelfTest` with disjoint production/self-test parameter sets. In pinned mode it does not call the environment-mutating discovery branch: it resolves `java.exe`, `javac.exe`, `jar.exe`, `jdeps.exe` and `jlink.exe` only as reparse-free children of the explicit root, verifies each executable identity/hash plus Eclipse Adoptium 17.0.19 against config/receipt, and launches them by absolute path. Machine/User/process `JAVA_HOME` and `PATH` are deliberately poisoned in self-tests to prove they cannot override the explicit root. `build-installer.ps1` must call this pinned path directly in Gate mode and its StagePayload/JDK inspection consumes the same validated object; `build.cmd` remains a legacy developer entry and is never used by Gate 0. Legacy non-Gate `build-java.ps1` behavior remains unchanged.

All Gate Git, Node/npm, .NET/NuGet/MSBuild, Java, Cargo/Rust, native CMake/MSVC and UE/UBT child processes go through tracked `gate-child-environment.ps1`; absolute executable paths alone are not treated as isolation. It exports the primary child-process entry `Invoke-YueEGateChildProcess -Kind <Git|Node|Npm|DotNet|Java|Cargo|Native|Unreal> -Root -Executable -ArgumentList -WorkingDirectory -OutputMode <Probe|Build> [-GitPolicy <ObjectRead|WorkingTreeCompare|Dependency>] [-LogRoot] [-AllowedPathEntries] [-Environment]`, `Probe` forbids `LogRoot`; `Build` requires a validated contained `LogRoot` parent and atomically creates a fresh lowercase-32hex child directory for that invocation. `GitPolicy` is required exactly when `Kind Git` and rejected for every other kind. It snapshots the parent environment, builds a per-tool allowlisted child dictionary and restores the parent in `finally`. Working directory defaults to the validated repository root; npm/package, Cargo, DotNet/global.json, Native and Unreal callers must pass their exact reparse-free repository/tool/generated subdirectory, and anything outside the approved root/tool roots is rejected. `.bat/.cmd` executables are invoked only through absolute `%ComSpec% /d /s /c call <validated-script> <escaped-token-array>` inside the same child environment; callers never concatenate a command string. Git removes every inherited `GIT_*`, `HOME`, `USERPROFILE`, `XDG_CONFIG_HOME`, `SSH_*`, proxy and credential-helper variable, then supplies a contained empty config/home, `GIT_CONFIG_NOSYSTEM=1`, disabled hooks/templates/credentials, fixed HTTPS remotes and protocol allowlist. `ObjectRead` permits only object/index reads and disables every filter; `Dependency` permits only the locked dependency clone/fetch/verify verbs and also disables every filter; `WorkingTreeCompare` permits only `status` and non-cached `diff`/`diff --quiet` in the validated source worktree and injects the same four hash-bound absolute Git-LFS entries defined below. Kind-Git self-tests commit a materialized LFS fixture, require `WorkingTreeCompare` to report clean, mutate it and require dirty, while both other policies reject that verb/filter crossover and poisoned global filters never execute. Node/npm removes `NODE_OPTIONS`, `NODE_PATH` and every inherited `NPM_CONFIG_*`, then sets only the validated contained cache/user/global-config/temp values. DotNet removes every inherited `DOTNET_*`, `NUGET_*`, `MSBuildSDKsPath`, `MSBUILD_EXE_PATH`, `MSBuildExtensionsPath`, `MSBuildExtensionsPath32`, `MSBuildExtensionsPath64`, `FrameworkPathOverride` and `RestoreSources`, then sets only exact validated `DOTNET_ROOT`, `DOTNET_ROOT_X64`, `DOTNET_HOST_PATH`, `DOTNET_CLI_HOME`, `DOTNET_MULTILEVEL_LOOKUP=0`, `NUGET_PACKAGES`, `NUGET_HTTP_CACHE_PATH`, `NUGET_PLUGINS_CACHE_PATH` and offline config inputs; `DOTNET_STARTUP_HOOKS`, `DOTNET_ADDITIONAL_DEPS` and `DOTNET_SHARED_STORE` remain absent. Java removes `JAVA_TOOL_OPTIONS`, `_JAVA_OPTIONS`, `JDK_JAVA_OPTIONS` and `CLASSPATH`, then sets only explicit `JAVA_HOME`. Cargo removes every inherited `CARGO_*` plus `RUSTC`, `RUSTC_WRAPPER`, `RUSTC_WORKSPACE_WRAPPER`, `RUSTFLAGS`, `CARGO_ENCODED_RUSTFLAGS`, `RUSTDOCFLAGS`, `RUSTC_BOOTSTRAP` and `RUSTUP_TOOLCHAIN`; it then sets only validated `CARGO_HOME`, explicit configured `RUSTC`, contained `CARGO_TARGET_DIR=<Root>/out/yue-e/rust-target`, offline vendor source arguments and the repository's reviewed CRT-static config. It preserves but never rewrites the preflight-validated `RUSTUP_HOME`. Native removes `CMAKE_TOOLCHAIN_FILE`, `CMAKE_GENERATOR`, `CMAKE_GENERATOR_TOOLSET`, `CMAKE_PREFIX_PATH`, `CL`, `_CL_`, `LINK`, `_LINK_`, `INCLUDE`, `LIB`, `LIBPATH`, `CC`, `CXX`, `VSINSTALLDIR`, `VisualStudioVersion`, `VCToolsInstallDir`, `WindowsSdkDir` and `VSCMD_*`, then reconstructs only the receipt-validated VS17 v143/SDK/CMake environment. UE/UBT removes the same ambient Visual Studio/compiler variables plus `PreferredToolArchitecture` and `UE_SDKS_ROOT` before passing the explicit VS2022 switches. For every kind, `PATH` is reconstructed from `%SystemRoot%/System32` plus only validated executable-parent/toolchain directories required by that child; the helper rejects any reparse/out-of-root output destination, captures at most 1 MiB per stream, rejects overflow, and returns `{ExitCode,StdoutBytes,StderrBytes,StdoutByteLength,StderrByteLength,StdoutSha256,StderrSha256}`. Tool-specific callers decode those bounded bytes with their declared encoding, parse version/build identities, sanitize before evidence output and never log raw private paths. Poisoned-env self-tests preload throwing Node JS/JVM/.NET startup hooks and additional deps, rogue NuGet/MSBuild/CMake toolchains, fake rustc/CL/LINK wrappers, VS2026 variables and out-of-root sentinels, proving none executes or receives a write; an unrecognized environment key requested by a caller is rejected.

In `-RequireProvisionedDependencies`, native/Rust freshness is part of the contract: validate and remove only the exact generated `<Root>/out/yue-e/native-gate/xaudio2` and `<Root>/out/yue-e/rust-target` roots, recreate them empty with a run sentinel, and pass explicit CMake `-S/-B` plus Cargo target paths. Never reuse the repository's legacy `native/windows/.cmake-build-xaudio2-vs17` or an earlier `CMakeCache.txt`/Cargo fingerprint. The full-build receipt records empty-start sentinel, start/end QPC and the resulting inventories. Self-tests seed malicious legacy/contained `CMakeCache.txt`, compiler/prefix paths, Cargo fingerprints and outside sentinels and prove the Gate build ignores or safely clears only validated generated roots.

The receipt schema's authoritative `tools` shape, superseding the shorter inline enumeration above, is exactly `{node:{version,executableSha256},npm:{version,cliSha256},git:{version,executableSha256,lfsVersion,lfsExecutableSha256},dotnet:{sdkVersion,executableSha256,globalJsonSha256,requiredInstalledPacksInventorySha256},java:{vendor,version,javaSha256,javacSha256,jarSha256,jdepsSha256,jlinkSha256},cargo:{version,executableSha256},rustc:{version,executableSha256}}`; `additionalProperties:false` applies to every nested tool object.

`cliHomeRoot` is exactly `.tools/yue-e/dotnet-cli-home` and `pluginCacheRoot` is exactly `.tools/yue-e/nuget-plugin-cache`; both are reparse-free mutable caches, schema-declared for containment but excluded from authoritative package inventories. No consumer derives an undeclared user-profile cache path.

The helper's authoritative output contract supersedes the earlier 1 MiB shorthand. `-OutputMode Probe` concurrently drains both pipes into memory, caps each at 1 MiB and rejects overflow; it is only for short version/contract probes. `-OutputMode Build -LogRoot <validated contained parent>` atomically creates one fresh lowercase-32hex reparse-free child below that parent, then concurrently drains stdout/stderr into separate pre-created log files while incrementally hashing, with a 512 MiB per-stream/1 GiB per-child quota. It returns `{ExitCode,StdoutLogRelativePath,StderrLogRelativePath,StdoutByteLength,StderrByteLength,StdoutSha256,StderrSha256,SanitizedHead,SanitizedTail}`; quota overflow terminates only that exact child tree and fails. Build/UAT/UBT/MSBuild/CMake/Cargo/publish calls must use `Build`; probes and Node checkers use `Probe`. Both pipes are drained asynchronously from process start through exit to prevent deadlock, and raw logs remain only beneath ignored `out/yue-e/gate-child-logs/<caller>/<32hex-runId>`.

Every `Kind Node` process starts suspended in a new non-breakaway `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` Job, is assigned before resume, and its descendants inherit that Job. After Node exits or any exception occurs, the helper bounded-waits, closes the Job and verifies zero descendant survivors before returning. This makes Git/LFS, pinned Java, Edge and packaged-host descendants enforced by the preload hook race-free and gives `PinnedEdge` deterministic multi-process cleanup. Self-tests deliberately leave Git, Java and Edge grandchildren alive and require exact-tree cleanup without touching an unrelated sentinel process.

The same module exports `New-YueEGateRunDirectory -Root -Parent -Purpose`: it validates every ancestor beneath the repository, rejects reparse points, atomically creates one previously absent lowercase-32hex child and writes `.yue-e-run.json` with purpose/start QPC. Report/log consumers require that sentinel and reject any file older than the run start, so repeated RED/GREEN runs cannot reuse stale evidence. The script's disjoint `-Root -SelfTest` parameter set exercises both exported entries and creates concurrent runs, seeded collisions, reparse ancestors, stale sentinels and outside targets and requires unique contained directories plus safe exact cleanup.

Repository-authoring Git commands shown as `git add/diff/commit/status/worktree/lfs status` are controller VCS operations, not build/test/dependency child processes. The plan runner resolves their literal `git` token to the configured absolute hash-validated Git in a contained HOME/config with `GIT_CONFIG_NOSYSTEM=1`, hooks/templates/credentials/rewrites/proxy/prompt disabled and `commit.gpgSign=false`; only the shown repository-local authoring verbs are permitted. Before entering that isolation, the controller reads `user.name` and `user.email` once through the same validated Git, requires nonempty single-line values without control characters, keeps them only in memory and never logs or persists them. A `commit` receives those values through fixed `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME` and `GIT_COMMITTER_EMAIL`; every non-commit operation omits them.

Controller Git has two explicit filter policies. Pure object-only operations (`cat-file`, `show`, `diff --cached`) and dependency Git keep every filter disabled. Every working-tree-aware repository operation (`add`, `status`, non-`--cached` `diff`/`diff --quiet`, `commit` index refresh and `worktree` checkout) instead receives four per-invocation, non-persistent `-c` entries constructed from the hash-validated absolute Git LFS executable: `filter.lfs.process=<quoted-absolute-git-lfs> filter-process`, `filter.lfs.clean=<quoted-absolute-git-lfs> clean -- %f`, `filter.lfs.smudge=<quoted-absolute-git-lfs> smudge -- %f`, and `filter.lfs.required=true`; the contained `PATH` is not used to resolve `git-lfs`. Every shown `git lfs status` is notation only: the controller directly launches the configured, hash-revalidated absolute `git-lfs.exe` as `status`, supplies the same four configuration entries through fixed per-process `GIT_CONFIG_COUNT/GIT_CONFIG_KEY_n/GIT_CONFIG_VALUE_n`, and gives it a PATH containing only System32 plus the already validated Git and Git-LFS executable parents so any Git child resolves to that exact validated Git. No other filter or executable is enabled. The controller self-test uses an empty isolated HOME/config, poisoned global filter configuration and an identity available only from the original global config, then stages and commits a small LFS fixture. It requires a canonical v1 staged pointer whose OID and size equal the raw worktree bytes, a matching Git LFS object with those bytes, the worktree file still materialized, isolated `status --porcelain` empty, isolated non-cached `diff --quiet` successful, then mutates the raw file and requires both operations to report dirty; direct absolute Git-LFS status must name that same OID. It also requires successful commit identity, no hook/signing execution and no leaked identity. Dependency checkout and every Git call originating inside repository code remain subject to `Kind Git` or the Node preload hook.

Accordingly, the exact authoritative child-process entry signature is `Invoke-YueEGateChildProcess -Kind <Git|Node|Npm|DotNet|Java|Cargo|Native|Unreal> -Root -Executable -ArgumentList -WorkingDirectory -OutputMode <Probe|Build> [-GitPolicy <ObjectRead|WorkingTreeCompare|Dependency>] [-LogRoot] [-AllowedPathEntries] [-Environment]`. `Probe` forbids `LogRoot`; `Build` requires a validated contained `LogRoot` parent and atomically creates a fresh lowercase-32hex child directory for that invocation. `GitPolicy` is mandatory only for `Kind Git`, and its verb/filter restrictions are the authoritative ones above. This signature and the mode-specific return shapes supersede the earlier shorthand signature/return sentence in full.

Before any DotNet/MSBuild child, enumerate `Directory.Build.props`, `Directory.Build.targets`, `Directory.Packages.props`, `NuGet.Config` and MSBuild user-extension paths from the project directory through the volume root. Reject every repository-external file and every repository-internal file not in the tracked Gate allowlist; Gate 0's allowlist is empty. Also pass `ImportDirectoryBuildProps=false`, `ImportDirectoryBuildTargets=false`, a contained empty `MSBuildUserExtensionsPath`, explicit offline NuGet config and locked restore properties. Before Cargo, run from `native/rust-audio-upmix`, enumerate every ancestor `.cargo/config`/`config.toml` through the volume root plus contained `CARGO_HOME`, reject all except the tracked reviewed project config and generated receipt-bound Cargo-home config, and pass explicit offline/vendor `--config` values. Poison tests place outside `Directory.*`, user MSBuild extensions and ancestor Cargo linker/source/runner configs with write sentinels; every Gate child must reject them before launch.

- [ ] **Step 6: Run schema/self-test GREEN and current-machine preflight RED.**

`invoke-yue-e-node-script.ps1` exports `Invoke-YueEGateNodeScript -Root -Config -Script -ArgumentList [-CheckSyntax] -Mode <BootstrapContract|Provisioned> [-DescendantPolicy <None|PinnedJava|PinnedEdge|PinnedJavaAndEdge|PinnedPackagedHost>]`. It validates the configured Node, Git and Git LFS absolute paths/hashes/versions, script containment and string-array arguments; reconstructs PATH from System32 plus only the validated Node/Git executable parents; then calls `Invoke-YueEGateChildProcess -Kind Node -WorkingDirectory <Root> -OutputMode Probe` and returns the typed result. `DescendantPolicy` defaults to `None`, meaning no extra descendant beyond the fixed Git/Git LFS base allowlist; `BootstrapContract` binds those two tools to config identities and `Provisioned` also requires matching receipt identities. The wrapper preloads tracked `locked-node-child-process-hook.mjs`, which always permits only config-hash-bound Git/Git LFS for the checkers' fixed read-only verbs under the same contained empty HOME/XDG/config, `GIT_CONFIG_NOSYSTEM=1`, no excludes/pager/hooks/credentials/rewrites/proxy/prompt and HTTPS-only policy as `Kind Git` and otherwise rejects descendant launch. The hook classifies pure object reads and cached diffs with filters disabled, but injects the same four absolute hash-bound Git-LFS filter entries for `status` and every non-cached worktree `diff`; a direct LFS status operation launches only the configured absolute Git-LFS executable with the constrained validated Git/Git-LFS PATH described above. Its self-tests prove a materialized committed LFS fixture is clean, a changed fixture is dirty and poisoned ambient filters/executables cannot participate. `PinnedJava` permits only receipt/config-hash-validated absolute Java 17.0.19 `java.exe`/`javac.exe`; `PinnedEdge` additionally permits only the preflight-validated configured Edge executable; `PinnedJavaAndEdge` permits both the pinned Java pair and that Edge executable; `PinnedPackagedHost` permits only the manifest-hash-validated host executable named by a contained `--stage-result`, launches it in a Job and cleans only that exact tree. The hook reconstructs each descendant environment, strips ambient Java/Node injection variables, requires arguments to carry the same explicit paths, and rejects shell commands, hard-coded Java 26 paths, PATH fallback and any unlisted executable. Non-`None` is allowed only for the explicitly typed Task 2 capture, Task 8 legacy regressions, Task 10 transition analyzer/native regressions and packaged-player runtime call sites; poisoned absolute/PATH fixtures prove bypass fails. This is required because baseline/reference checkers call `git show`, `status`, worktree `diff`, `check-ignore`, `check-attr` and LFS; no checker falls back to ambient Git. `BootstrapContract` validates those identities from config and is allowed only for the two exact Task 1 baseline/toolchain contract scripts before a receipt exists; `Provisioned` additionally requires matching receipt Node/Git identities. After the single pre-helper RED at Step 3, every executable Node command in this plan uses this function and checks `ExitCode`. Poisoned-PATH tests place fake `git`, `git-lfs` and Node shims first and prove none executes.

Before the first provision/self-test, make every immutable dependency authority consumed by provision tracked. This narrow bootstrap commit contains no generated packages/source checkout and is required because provision accepts only committed lock/config bytes:

```powershell
git add -- global.json scripts/yue-e/toolchain-lock.json `
  scripts/yue-e/nuget-online.config `
  scripts/yue-e/dotnet-runtime-pack-lock.json `
  scripts/yue-e/build-tools/package.json `
  scripts/yue-e/build-tools/package-lock.json `
  scripts/yue-e/kugou-runtime-package.json `
  scripts/yue-e/kugou-runtime-package-lock.json `
  music-api-plugins/netease/runtime-package-lock.json `
  music-api-plugins/qq/runtime-package-lock.json rust-toolchain.toml `
  contracts/yue-e/provision-receipt-v1.schema.json `
  native/windows/winforms/packages.lock.json `
  native/windows/setup/packages.lock.json `
  native/windows/edge-harness/packages.lock.json `
  native/windows/startup-harness/packages.lock.json `
  native/windows/winforms/FeMonsterClient.WinForms.csproj `
  native/windows/setup/FeMonsterSetup.csproj `
  native/windows/edge-harness/FeMonster.EdgeHarness.csproj `
  native/windows/startup-harness/FeMonster.StartupHarness.csproj
git diff --cached --check
git commit -m "build: lock initial YueE dependency closure"
```

At this Task 1 point, the clean-cache .NET self-test covers exactly those four tracked projects and asserts that exact project-set hash. The host harness and audio probe do not exist yet; Tasks 4 and 10 each add their zero-package project+lock in a narrow commit, rerun provision, and rerun the now-expanded clean-cache self-test before consuming DotNet. The phrase “both zero-package harnesses” in the closure contract applies only after those respective tracked files exist.

```powershell
. .\scripts\yue-e\invoke-yue-e-node-script.ps1
$YueEBaselineCheck = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
  -Config .\.yue-e-local.json -Mode BootstrapContract `
  -Script .\scripts\check-yue-e-baseline.mjs `
  -ArgumentList @('--root','.', '--config','.yue-e-local.json')
if ($YueEBaselineCheck.ExitCode -ne 0) { throw "YueEBaselineCheckFailed:$($YueEBaselineCheck.ExitCode)" }
$YueEToolchainContract = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
  -Config .\.yue-e-local.json -Mode BootstrapContract `
  -Script .\scripts\check-yue-e-toolchain-contract.mjs -ArgumentList @('--root','.')
if ($YueEToolchainContract.ExitCode -ne 0) { throw "YueEToolchainContractFailed:$($YueEToolchainContract.ExitCode)" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\gate-child-environment.ps1 `
  -Root (Get-Location).Path -SelfTest
if ($LASTEXITCODE -ne 0) { throw "GateChildEnvironmentSelfTestFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\provision-build-dependencies.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json -SelfTest
if ($LASTEXITCODE -ne 0) { throw "ProvisionSelfTestFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\build-java.ps1 -Root (Get-Location).Path -SelfTest
if ($LASTEXITCODE -ne 0) { throw "PinnedJavaSelfTestFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\invoke-yue-e-dotnet-project.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json -SelfTest
if ($LASTEXITCODE -ne 0) { throw "DotNetClosureSelfTestFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\check-yue-e-toolchain.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -JsonOutput .\out\yue-e\toolchain-preflight.json
$YueEPreflightExit = $LASTEXITCODE
if ($YueEPreflightExit -ne 2) { throw "ExpectedPrerequisitePreflightExit2:$YueEPreflightExit" }
$YueEPreflight = Get-Content .\out\yue-e\toolchain-preflight.json -Raw | ConvertFrom-Json
$YueEExpectedBlockers = @(
  'Blender520PortableMissing','VisualStudio2022NativeGameMissing',
  'RustToolchainMissing','ProvisionedBuildDependenciesMissing','MixedDpiMonitorPairMissing')
foreach ($YueEBlocker in $YueEExpectedBlockers) {
  if ($YueEPreflight.resultCodes -notcontains $YueEBlocker) { throw "ExpectedPreflightBlockerMissing:$YueEBlocker" }
}
```

Expected before prerequisites: contracts/baseline pass; real preflight exits `2` with at least `Blender520PortableMissing`, `VisualStudio2022NativeGameMissing`, `RustToolchainMissing`, `ProvisionedBuildDependenciesMissing` and `MixedDpiMonitorPairMissing` on the observed machine.

- [ ] **Step 7: Install exact external prerequisites, update local config and rerun GREEN.**

Install the hash-verified official Blender 5.2.0 portable archive in a fixed local tools directory, calculate the extracted executable SHA-256 into `.yue-e-local.json`, and install Visual Studio 2022 with `Game Development with C++`, MSVC v143 x64/x86 and Windows 11 SDK 10.0.26100.0. Install/configure exact Rust/Cargo 1.89.0 MSVC; point config at the already matching or newly installed locked Node/npm and Adoptium JDK. Connect/provision a second real desktop display output, keep both targets active, and set Windows scaling so their effective DPI values differ (for example 100% and 125%); capture is run locally rather than through a single-display remote/virtual session. Store actual executable/roots only in local config, then provision the ignored per-worktree build closure and rerun preflight:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\provision-build-dependencies.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Receipt .\.tools\yue-e\provision-receipt.json
if ($LASTEXITCODE -ne 0) { throw "ProvisionDependenciesFailed:$LASTEXITCODE" }

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\check-yue-e-toolchain.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -JsonOutput .\out\yue-e\toolchain-preflight.json
if ($LASTEXITCODE -ne 0) { throw "ToolchainPreflightFailed:$LASTEXITCODE" }
```

Expected: both exit 0; output records Blender executable/version/archive hash verification, UE CL, VS 17.x workload, Node/npm, exact .NET SDK/muxer/global.json/installed-pack/NuGet closure, JDK/Rust/Cargo, exact Kugou/OBR/esbuild provision receipt, Windows SDK, baseline commit and two sanitized active-display records with distinct effective DPI without leaking absolute user paths. Do not change the lock to VS 2026 or waive the real monitor pair.

- [ ] **Step 8: Commit the repository policy.**

```powershell
git add -- .gitattributes .gitignore global.json scripts/yue-e/toolchain-lock.json `
  scripts/yue-e/local-config.example.json scripts/yue-e/check-yue-e-toolchain.ps1 `
  scripts/yue-e/provision-build-dependencies.ps1 `
  scripts/yue-e/gate-child-environment.ps1 `
  scripts/yue-e/invoke-yue-e-node-script.ps1 `
  scripts/yue-e/invoke-yue-e-git.ps1 `
  scripts/yue-e/locked-node-child-process-hook.mjs `
  scripts/yue-e/invoke-yue-e-dotnet-project.ps1 `
  scripts/yue-e/build-tools/package.json `
  scripts/yue-e/build-tools/package-lock.json scripts/yue-e/kugou-runtime-package.json `
  scripts/yue-e/kugou-runtime-package-lock.json `
  scripts/yue-e/nuget-online.config scripts/yue-e/dotnet-runtime-pack-lock.json `
  contracts/yue-e/provision-receipt-v1.schema.json rust-toolchain.toml `
  native/windows/winforms/packages.lock.json `
  native/windows/setup/packages.lock.json `
  native/windows/edge-harness/packages.lock.json `
  native/windows/startup-harness/packages.lock.json `
  native/windows/winforms/FeMonsterClient.WinForms.csproj `
  native/windows/setup/FeMonsterSetup.csproj `
  native/windows/edge-harness/FeMonster.EdgeHarness.csproj `
  native/windows/startup-harness/FeMonster.StartupHarness.csproj `
  scripts/check-yue-e-baseline.mjs scripts/check-yue-e-toolchain-contract.mjs `
  music-api-plugins/netease/runtime-package-lock.json `
  music-api-plugins/qq/runtime-package-lock.json `
  music-api-plugins/netease/build.ps1 music-api-plugins/qq/build.ps1 `
  music-api-plugins/kugou/build.ps1 music-api-plugins/qishui/build.ps1 `
  scripts/build-java.ps1 `
  scripts/build-xaudio2.ps1 scripts/build-installer.ps1 `
  scripts/build-winforms-client.ps1
git diff --cached --check
git commit -m "build: lock YueE Gate 0 toolchain"
```

Expected: `.yue-e-local.json` is ignored and absent from the commit; `git show --stat --oneline HEAD` contains only the listed policy/probe files.

## Task 2: Freeze the Approved Character, Map, UI and Preset Baselines

**Files:**

- Create: `contracts/yue-e/reference-baselines-v1.schema.json`
- Create: `contracts/yue-e/world-map-reference-v1.schema.json`
- Create: `docs/superpowers/assets/yue-e/reference-baselines-v1.json`
- Create: `docs/superpowers/assets/yue-e/world-map-reference-01.html`
- Create: `docs/superpowers/assets/yue-e/world-map-reference-01.json`
- Create: `docs/superpowers/assets/yue-e/ui-baselines/playlist-and-player-1920x1080.png`
- Create: `docs/superpowers/assets/yue-e/ui-baselines/preset-picker-1920x1080.png`
- Create: `docs/superpowers/assets/yue-e/ui-baselines/search-suggestions-1920x1080.png`
- Create: `docs/superpowers/assets/yue-e/ui-baselines/settings-center-1920x1080.png`
- Create: `docs/superpowers/assets/yue-e/ui-baselines/achievements-1920x1080.png`
- Create: `docs/superpowers/assets/yue-e/ui-baselines/function-shortcuts-1920x1080.png`
- Create: `docs/superpowers/assets/yue-e/ui-baselines/capture-log.json`
- Create: `web/scene-widgets/manifests/SceneUIManifest-v1.json`
- Create: `web/scene-widgets/manifests/PresetManifest-v1.json`
- Create: `scripts/yue-e/create-gate0-reference-manifest.ps1`
- Create: `scripts/check-yue-e-reference-manifests.mjs`
- Create: `scripts/capture-yue-e-ui-baselines.mjs`
- Create: `scripts/fixtures/yue-e-ui-baseline-anonymous.json`

- [ ] **Step 1: Author the strict schemas, then write a RED reference-manifest checker.**

Create both listed schemas first with their exact IDs, `additionalProperties:false` at every object, normalized repository-relative paths, unique stable IDs, fixed six map regions/reserves and the complete character/UI/preset unions below. Schema self-fixtures pass before the checker runs; the intended RED is missing manifest instances, never missing/invalid schema.

The checker accepts `--root --config` and rejects missing files, schema/version drift, duplicate IDs, non-repository paths, missing selectors/modules, invalid LFS pointer/content pairs, map HTML↔JSON drift, and an incomplete preset union. It explicitly expects the three frozen character rows, both `WorldMapReference-01` files, `SceneUIManifest-v1`, `PresetManifest-v1`, and all six screenshots.

For protected existing Web UI it records `baselineCommit`, source path, historical Git blob and canonical semantic-slice hash—not a promise that the entire current file can never change. Canonical slices are DOM subtrees by frozen selector and ordinal preset-directory/function definitions by frozen extractor version. The checker reads historical bytes with `git show <baselineCommit>:<path>`, recalculates those historical slices, then verifies the same protected slices in the candidate. Task 8 may change unrelated entry/fog/suspension hunks; changing a protected UI/preset slice invalidates Gate 0 and requires explicit baseline refresh/reapproval.

- [ ] **Step 2: Run the checker and confirm RED.**

```powershell
. .\scripts\yue-e\invoke-yue-e-node-script.ps1
$YueEReferenceRed = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
  -Config .\.yue-e-local.json -Mode Provisioned `
  -Script .\scripts\check-yue-e-reference-manifests.mjs `
  -ArgumentList @('--root','.', '--config','.yue-e-local.json')
if ($YueEReferenceRed.ExitCode -eq 0) { throw 'ExpectedReferenceManifestRed' }
$YueEReferenceRedText = [Text.Encoding]::UTF8.GetString($YueEReferenceRed.StdoutBytes) + "`n" +
  [Text.Encoding]::UTF8.GetString($YueEReferenceRed.StderrBytes)
if ($YueEReferenceRedText -notmatch 'ReferenceManifestMissing' -or
    $YueEReferenceRedText -match 'SyntaxError|ERR_MODULE_NOT_FOUND|ConfigMissing') {
  throw 'UnexpectedReferenceManifestRed'
}
```

Expected: non-zero with stable `ReferenceManifestMissing` naming missing `reference-baselines-v1.json` and both UI/preset manifests; it must not report the three existing character PNGs as missing. The checker prints the token only after config/schema bootstrap succeeds.

- [ ] **Step 3: Promote the approved map source without redesigning it.**

Resolve the approval source root from `.yue-e-local.json`; using `apply_patch`, promote the original HTML as UTF-8/LF without redesign. Record original and promoted SHA-256; equivalence may normalize only BOM/newlines. Create `world-map-reference-01.json` with `viewBox: "0 0 1200 700"`, logical origin mapping for `music-zone` at SVG `(604,358)`, the six stable region IDs and six center spokes, plus these reserve records:

| Reserve ID | SVG point | nearestRegionId | openDirection |
| --- | --- | --- | --- |
| `future-content-01` | `[155,347]` | `deep-resonance-canyon` | `west` |
| `future-content-02` | `[753,354]` | `mirror-rain-coast` | `east-inner-gap` |
| `future-content-03` | `[1087,325]` | `storm-corridor` | `east` |
| `future-content-04` | `[408,654]` | `mist-sound-woodland` | `south-west` |
| `future-content-05` | `[783,653]` | `mist-sound-woodland` | `south-east` |
| `future-content-06` | `[463,51]` | `cloudridge-court` | `north` |

The checker asserts these coordinates, IDs, center adjacency and SHA fields exactly. Open the HTML offline and verify “音乐区” is a local area in “遇E”, not the world name/boundary.

- [ ] **Step 4: Capture deterministic current-Web visual baselines.**

Create an anonymous, local-only fixture with fixed locale `zh-CN`, fixed clock `2026-08-22T12:00:00+08:00`, seeded playlist/track/search/achievement data, no account IDs/tokens/network responses, reduced motion off and deterministic font readiness. `capture-yue-e-ui-baselines.mjs` starts the existing local app, uses installed Edge at 1920×1080, device scale factor 1, waits for `document.fonts.ready`, disables animation only in the capture page, and captures these six exact named scenes:

- selector array `[#orbPlaylists, #playlistShelf, .player-dock]`, captured as their padded union rectangle in a loaded-track fixture;
- the preset picker containing built-in choices and the dynamic-user-preset container;
- selector array `[#topSearchForm, #searchSuggestions]`, captured as their padded union rectangle with deterministic suggestions;
- `#runtimeSettingsPanel` on its default General page;
- `#communityProfileAchievementPage` with a deterministic achievement fixture;
- the top-level shortcut cluster containing settings, recording, achievements and favorites entry states.

The capture tool serves the fixture from its own in-process loopback server, so Edge is its only child. It accepts mandatory `--edge-executable`, rejects fixed install-path/PATH discovery and runs under `PinnedEdge`.

Run exactly:

```powershell
. .\scripts\yue-e\invoke-yue-e-node-script.ps1
$YueEConfig = Get-Content .\.yue-e-local.json | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$YueEConfig.edgeExecutable)) { throw 'EdgeExecutableMissing' }
$YueECapture = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
  -Config .\.yue-e-local.json -Mode Provisioned `
  -Script .\scripts\capture-yue-e-ui-baselines.mjs `
  -ArgumentList @('--root','.', '--config','.yue-e-local.json',
    '--fixture','.\scripts\fixtures\yue-e-ui-baseline-anonymous.json',
    '--viewport','1920x1080','--output','.\docs\superpowers\assets\yue-e\ui-baselines',
    '--edge-executable',$YueEConfig.edgeExecutable) `
  -DescendantPolicy PinnedEdge
if ($YueECapture.ExitCode -ne 0) { throw "UiBaselineCaptureFailed:$($YueECapture.ExitCode)" }
```

The script must produce exactly `playlist-and-player`, `preset-picker`, `search-suggestions`, `settings-center`, `achievements`, and `function-shortcuts` PNGs plus `ui-baselines/capture-log.json` containing fixture hash, baseline commit, viewport/DPR/locale/font readiness and each image hash. The log contains no absolute path/account data and is tracked as ordinary Git, not LFS. Do not image-generate or retouch the PNGs.

- [ ] **Step 5: Author `SceneUIManifest-v1`.**

Use schema `yue-e.scene-ui-manifest/v1`, manifest ID `SceneUIManifest-v1`, and these stable component IDs:

```text
yue-e.ui.playlist-orb       → #orbPlaylists                  → SharedWebComponent
yue-e.ui.playlist-shelf     → #playlistShelf                 → SharedWebComponent
yue-e.ui.player-dock        → .player-dock                   → SharedWebComponent
yue-e.ui.search             → #topSearchForm,#searchSuggestions → SharedWebComponent
yue-e.ui.settings           → #runtimeSettingsPanel          → UMGAdapter
yue-e.ui.recording          → #runtimeRecordingButton        → UMGAdapter
yue-e.ui.achievements       → #communityProfileAchievementPage → UMGAdapter
yue-e.ui.favorites          → #topFavoritesButton            → UMGAdapter
```

`yue-e.ui.settings` also records `#runtimeSettingsButton`; `yue-e.ui.achievements` also records `#communityAchievementButton`. Each independent Actor/component entry records source selector/module, allowed implementation, command IDs, visual baseline path/hash and `draggable: true`; recording/favorites may reference `function-shortcuts-1920x1080.png` only with explicit integer crop rectangles. Semantics are exactly `settings.open`, `recording.open`, `achievements.open`, and `favorites.open`. Player commands use explicit play/pause, previous/next, seek and volume semantics; never `toggle` over IPC.

- [ ] **Step 6: Author `PresetManifest-v1`.**

Use schema `yue-e.preset-manifest/v1`, manifest ID `PresetManifest-v1`; enumerate all 11 `app.js` built-ins, bundled `preset-storm-ocean-horizon`, and dynamic contract `fe-monster.scene-preset/v1` with `stableIdRequired: true`. Every static entry records kind, stable ID, `baselineCommit`, source path, historical whole-file Git blob/SHA, extractor version and canonical **preset semantic-slice SHA**. Candidate validation compares the extracted semantic slice, not the mutable whole-file SHA; unrelated Task 8 hunks may change whole-file bytes. A source may be unavailable later only via explicit status, never by deleting its ID.

- [ ] **Step 7: Generate and verify the protected reference index.**

Validate every already-authored JSON instance against the Step 1 schemas. Then implement `create-gate0-reference-manifest.ps1` and stage the schemas, map, screenshots and UI/preset manifests. The script calculates SHA-256, byte length, PNG dimensions and ordinal IDs. For ordinary files it compares worktree bytes to staged index bytes. For LFS screenshots it parses the staged pointer (`oid sha256`, `size`), compares that OID/size to the worktree binary, and records both pointer Git blob and binary content SHA/size; it must never compare pointer bytes directly with PNG bytes. The three character PNGs must still match their frozen Git blob/content SHA. It writes the index only when all expected items are present.

```powershell
git add -- contracts/yue-e/reference-baselines-v1.schema.json `
  contracts/yue-e/world-map-reference-v1.schema.json `
  docs/superpowers/assets/yue-e/world-map-reference-01.html `
  docs/superpowers/assets/yue-e/world-map-reference-01.json `
  docs/superpowers/assets/yue-e/ui-baselines `
  web/scene-widgets/manifests
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\create-gate0-reference-manifest.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json
if ($LASTEXITCODE -ne 0) { throw "ReferenceIndexGenerationFailed:$LASTEXITCODE" }
. .\scripts\yue-e\invoke-yue-e-node-script.ps1
$YueEReferenceCheck = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
  -Config .\.yue-e-local.json -Mode Provisioned `
  -Script .\scripts\check-yue-e-reference-manifests.mjs `
  -ArgumentList @('--root','.', '--config','.yue-e-local.json')
if ($YueEReferenceCheck.ExitCode -ne 0) { throw "ReferenceManifestCheckFailed:$($YueEReferenceCheck.ExitCode)" }
```

Expected: both commands exit 0; the three character values exactly match the Frozen Gate 0 Contracts table; the preset checker reports 11 playback built-ins, 1 bundled scene and 1 dynamic protocol.

- [ ] **Step 8: Commit only the promoted references and contracts.**

```powershell
git add -- contracts/yue-e/reference-baselines-v1.schema.json `
  contracts/yue-e/world-map-reference-v1.schema.json `
  docs/superpowers/assets/yue-e/reference-baselines-v1.json `
  docs/superpowers/assets/yue-e/world-map-reference-01.html `
  docs/superpowers/assets/yue-e/world-map-reference-01.json `
  docs/superpowers/assets/yue-e/ui-baselines `
  web/scene-widgets/manifests `
  scripts/yue-e/create-gate0-reference-manifest.ps1 `
  scripts/capture-yue-e-ui-baselines.mjs `
  scripts/fixtures/yue-e-ui-baseline-anonymous.json `
  scripts/check-yue-e-reference-manifests.mjs
git diff --cached --check
git lfs status
git commit -m "docs: freeze YueE Gate 0 references"
```

Expected: all six newly captured UI PNGs are valid LFS pointers whose OIDs equal the corresponding worktree PNG SHA-256; the three pre-existing character PNG blobs remain unchanged.

## Task 3: Define One Versioned IPC and Web Message Contract

**Files:**

- Create: `contracts/yue-e/ipc-v1.schema.json`
- Create: `contracts/yue-e/ipc-v1-fixtures.json`
- Create: `contracts/yue-e/web-message-v1.schema.json`
- Create: `scripts/check-yue-e-ipc-contract.mjs`

- [ ] **Step 1: Write failing fixture-driven contract tests.**

Fixtures must cover every canonical message row, including `scene.reveal/revealReady`, `scene.suspend/suspendReady` and `scene.exitRequested`. Add pairs for each modifying type with accepted `expectedRevision`, stale/missing expected revision, duplicate same-ID/same-canonical-payload idempotency after revision advance, duplicate same-ID/different-payload conflict, correct/incorrect `replyTo`, each-direction sequence independence, stale `processGeneration`, stale `boundsRevision`, changed `swapChainEpoch`, render-size mismatch, and three genuinely consecutive `frame.safe` messages. Rejected requests also cover zero/oversize/truncated framing, invalid UTF-8, wrong protocol/major/session/PID/build ID, decreasing seq, unknown type, depth 33, string over 64 KiB, array over 4096 items, NaN/Infinity, and unnegotiated playback/pose; the latter must produce an accepted core `command.result(rejected, CapabilityNotNegotiated)` fixture rather than silently dropping the error.

- [ ] **Step 2: Run RED.**

```powershell
. .\scripts\yue-e\invoke-yue-e-node-script.ps1
$YueEIpcRed = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
  -Config .\.yue-e-local.json -Mode Provisioned `
  -Script .\scripts\check-yue-e-ipc-contract.mjs `
  -ArgumentList @('--config','.yue-e-local.json')
if ($YueEIpcRed.ExitCode -eq 0) { throw 'ExpectedIpcContractRed' }
$YueEIpcRedText = [Text.Encoding]::UTF8.GetString($YueEIpcRed.StdoutBytes) + "`n" +
  [Text.Encoding]::UTF8.GetString($YueEIpcRed.StderrBytes)
if ($YueEIpcRedText -notmatch 'IpcContractFilesMissing' -or
    $YueEIpcRedText -match 'SyntaxError|ERR_MODULE_NOT_FOUND|ConfigMissing') {
  throw 'UnexpectedIpcContractRed'
}
```

Expected: non-zero with stable `IpcContractFilesMissing` because schemas and fixtures do not yet exist; parser/config/module failures are not acceptable RED evidence.

- [ ] **Step 3: Add the canonical schemas.**

The IPC schema freezes the envelope, canonical message table, `additionalProperties: false`, integer bounds, 1 MiB encoded-frame maximum and per-type payload/correlation. The Web schema freezes `fe-yue-e-command`, `fe-yue-e-state`, `fe-yue-e-cover`, `fe-yue-e-cover-ack` and the test-only player probe. `command` is the discriminated union shown above: `enter` has request ID, Web navigation identity and `expectedStateRevision` but no old session; `exit|retry` additionally require the current session/process/activation triple. Host validates all of them atomically inside its transition gate.

State phases are exactly:

```text
idle, starting, handshaking, warming, ready-hidden,
covering-web, revealing, active, suspending, suspended, restoring,
covering, exiting,
recovering, faulted
```

- [ ] **Step 4: Add golden bytes and cross-language limits.**

For every accepted fixture, store canonical compact UTF-8 JSON and expected 4-byte LE prefix. For every rejected fixture, store one stable machine error code. Keep `sessionId` as lowercase 32-hex. Revision baselines—`expectedRevision`, `revision`, `expectedStateRevision` and `stateRevision`—allow `0..9007199254740991`. Identity/ordering counters—`processGeneration`, `seq`, `boundsRevision`, `swapChainEpoch`, `presentSerial` and Web `webViewGeneration`—require `1..9007199254740991`; zero is always an uninitialized/sentinel rejection and `frame.safe` waits for a positive native Present count rather than mapping tick/submission zero. C# and UE store them as `ulong`/`uint64` but reject values outside the wire range. Golden fixtures exercise zero rejection and maximum acceptance for every field separately.

- [ ] **Step 5: Run GREEN.**

```powershell
. .\scripts\yue-e\invoke-yue-e-node-script.ps1
$YueEIpcGreen = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
  -Config .\.yue-e-local.json -Mode Provisioned `
  -Script .\scripts\check-yue-e-ipc-contract.mjs `
  -ArgumentList @('--config','.yue-e-local.json')
if ($YueEIpcGreen.ExitCode -ne 0) { throw "IpcContractFailed:$($YueEIpcGreen.ExitCode)" }
```

Expected: exit 0 with accepted/rejected counts printed and no unclassified fixture.

- [ ] **Step 6: Commit the wire contract before either implementation.**

```powershell
git add -- contracts/yue-e scripts/check-yue-e-ipc-contract.mjs
git diff --cached --check
git commit -m "feat: define YueE IPC v1 contracts"
```

## Task 4: Implement the C# Protocol, Priority Queue and Lifecycle State Machine

**Files:**

- Create: `native/windows/winforms/yue-e/YueEHostState.cs`
- Create: `native/windows/winforms/yue-e/YueESession.cs`
- Create: `native/windows/winforms/yue-e/YueEIpcProtocol.cs`
- Create: `native/windows/winforms/yue-e/YueEStateMachine.cs`
- Create: `native/windows/yue-e-harness/FeMonster.YueEHostHarness.csproj`
- Create: `native/windows/yue-e-harness/packages.lock.json`
- Create: `native/windows/yue-e-harness/Program.cs`
- Create: `native/windows/yue-e-harness/FakeYueEChild.cs`

- [ ] **Step 1: Create a compile-green zero-extra-package harness and production type stubs.**

Follow the repository's `native/windows/startup-harness` pattern: target `net8.0-windows`, link the production `.cs` files, locate fixtures relative to the repository root and use explicit assertions/exit codes. Set `RestorePackagesWithLockFile=true`, keep zero `PackageReference`, commit the reviewed empty applicable graph in `packages.lock.json`, rerun `provision-build-dependencies.ps1` so `projectLockSetSha256` includes it, and verify that receipt before the first compile. First add the concrete records/enums/interfaces from **Production Interfaces** with minimal `NotImplementedException` bodies and compile once; do not make the first RED merely a missing-type compiler error.

Before any DotNet child runs, validate the project XML and lock JSON with PowerShell/.NET framework APIs only, then make this narrow dependency-scaffold commit so provision's tracked-lock authority can include it:

```powershell
git add -- native/windows/yue-e-harness/FeMonster.YueEHostHarness.csproj `
  native/windows/yue-e-harness/packages.lock.json
git diff --cached --check
git commit -m "build: lock YueE host harness dependencies"
```

- [ ] **Step 2: Add failing protocol fixture tests.**

Implement `protocol-valid` and `protocol-invalid` against shared golden fixtures, then run only those suites:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\provision-build-dependencies.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Receipt .\.tools\yue-e\provision-receipt.json
if ($LASTEXITCODE -ne 0) { throw "DotNetReprovisionFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\provision-build-dependencies.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json -SelfTest
if ($LASTEXITCODE -ne 0) { throw "ExpandedHostHarnessClosureSelfTestFailed:$LASTEXITCODE" }
$YueEHarnessProject = '.\native\windows\yue-e-harness\FeMonster.YueEHostHarness.csproj'
foreach ($YueERedSuite in @('protocol-valid','protocol-invalid')) {
  $YueERedOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass `
    -File .\scripts\yue-e\invoke-yue-e-dotnet-project.ps1 `
    -Root (Get-Location).Path -Config .\.yue-e-local.json `
    -Project $YueEHarnessProject -Operation Run -Configuration Release `
    -AppMode Suite -Suite $YueERedSuite 2>&1)
  $YueERedExit = $LASTEXITCODE
  $YueERedText = $YueERedOutput -join "`n"
  if ($YueERedExit -eq 0) { throw "ExpectedProtocolRed:$YueERedSuite" }
  if ($YueERedText -notmatch 'ProtocolNotImplemented' -or
      $YueERedText -match 'error CS\d+|NU\d{4}|RestoreFailed') {
    throw "UnexpectedProtocolRed:$YueERedSuite"
  }
}
```

Expected: compile succeeds; assertions fail with `ProtocolNotImplemented`.

- [ ] **Step 3: Implement bounded frame reads and payload decoding; make protocol suites GREEN.**

`ReadFrameAsync(Stream, ...)` reads the 4-byte prefix into a fixed buffer, rejects `0` and `> MaxFrameBytes` before allocating, then reads exactly the declared count. The separate `TryDecodePayload` rejects trailing/truncated/invalid UTF-8, parses with `JsonDocumentOptions.MaxDepth = 32`, and validates session, process generation, independent inbound sequence, command/reply/capability and type payload. Never deserialize directly into an unbounded object graph. Run `protocol-valid` and `protocol-invalid` to GREEN before continuing.

- [ ] **Step 4: Add the `framing` suite RED, implement frame writes, then make it GREEN.**

Test partial prefix/payload reads, EOF at every byte, oversize before allocation, one writer lock, exact fixed header fields and golden bytes. `YueEOutboundSequenceState` exclusively allocates seq under that lock; caller messages contain no seq. Serialize compact UTF-8, include `expectedRevision` in canonical bytes/fingerprint, reject non-finite values, write prefix + payload atomically and return the allocated seq. Run only `--suite framing` to GREEN.

- [ ] **Step 5: Add the `priority` suite RED, implement scheduling, then make it GREEN.**

Use a bounded keyed scheduler with these capacities:

```text
lifecycle: 32, never dropped; producer awaits a free slot
control:   128, reject producer when full
health:      4 per heartbeat/ack key, latest replaces same key only
present:     8 FIFO frame.safe messages; never coalesce distinct presentSerial
state:      64 total keys, coalesce existing key; reject a new key when full
telemetry:   8 total keys, latest replaces same key; drop oldest key for a new one
```

Lifecycle remains highest. During `Warming`, pending frame-safe is serviced after lifecycle and before control/state. Else service due health/present every four non-lifecycle dequeues or oldest age 100ms; heartbeat latency ≤250ms. State gets one slot every eight lifecycle/control. Latest replacement never crosses key/type. UE render callback writes Present samples through a nonblocking SPSC handoff; if the 8-entry FIFO is full, drop the newest sample, set sticky `PresentQueueOverflow`, and have IPC thread emit lifecycle `fatal` so Host aborts entry—never block render or reveal from a partially lost run. Health has only schema-known keys; impossible new key/rejected overflow is protocol fault. Tests cover every overflow rule plus continuous state/telemetry flood with no false timeout and successful three-frame admission.

- [ ] **Step 6: Add the full `state-machine` suite RED.**

Encode one test row for every transition/event in the Frozen Gate 0 table, plus every forbidden transition, duplicate enter/exit, retry budget, WebView invalidation and stale completion. Assert the distinct `processGeneration`, `webViewGeneration` and `stateRevision` rules. Run and confirm assertion RED with compile green.

- [ ] **Step 7: Implement the serialized host state machine and make its suite GREEN.**

Use one `SemaphoreSlim` transition gate, injected `TimeProvider`, and separate monotonic counters. An accepted Idle enter creates all new session values; non-Idle enter returns the current receipt; exit is idempotent; stale async completion is ignored; automatic `Recovering` keeps activation but replaces session/process generation once; explicit retry from `Faulted` starts a new activation. `Faulted` remains observable until retry/dismiss.

- [ ] **Step 8: Run all protocol/state suites together GREEN.**

```powershell
$YueEHarnessProject = '.\native\windows\yue-e-harness\FeMonster.YueEHostHarness.csproj'
foreach ($YueESuite in @('protocol-valid','protocol-invalid','framing','priority','state-machine')) {
  powershell.exe -NoProfile -ExecutionPolicy Bypass `
    -File .\scripts\yue-e\invoke-yue-e-dotnet-project.ps1 `
    -Root (Get-Location).Path -Config .\.yue-e-local.json `
    -Project $YueEHarnessProject -Operation Run -Configuration Release `
    -AppMode Suite -Suite $YueESuite
  if ($LASTEXITCODE -ne 0) { throw "YueEHarnessSuiteFailed:${YueESuite}:$LASTEXITCODE" }
}
```

Expected: all fixture counts match shared JSON; duplicate/reply semantics, full transition table and all three generation domains pass.

- [ ] **Step 9: Commit the C# contract implementation.**

```powershell
git add -- native/windows/winforms/yue-e/YueEHostState.cs `
  native/windows/winforms/yue-e/YueESession.cs `
  native/windows/winforms/yue-e/YueEIpcProtocol.cs `
  native/windows/winforms/yue-e/YueEStateMachine.cs `
  native/windows/yue-e-harness
if (git diff --cached --name-only | Select-String '/(bin|obj)/') { throw 'GeneratedDotnetOutputStaged' }
git diff --cached --check
git commit -m "feat: add YueE host protocol state machine"
```

## Task 5: Secure the Child Process, Pipe and Owned Window

**Files:**

- Create: `native/windows/winforms/yue-e/YueENamedPipeServer.cs`
- Create: `native/windows/winforms/yue-e/YueEJobObject.cs`
- Create: `native/windows/winforms/yue-e/YueEProcessLauncher.cs`
- Create: `native/windows/winforms/yue-e/YueERuntimeManifest.cs`
- Create: `native/windows/winforms/yue-e/YueEWindowController.cs`
- Create: `native/windows/winforms/yue-e/YueEResizeBands.cs`
- Modify: `native/windows/yue-e-harness/Program.cs`
- Modify: `native/windows/yue-e-harness/FakeYueEChild.cs`
- Create: `scripts/check-yue-e-window-contract.ps1`

- [ ] **Step 1: Add RED process, pipe and window suites.**

First add compile-green production interface/class stubs for process, Job, pipe, runtime verifier, window controller/factory and resize bands. The stub suite must emit stable assertion token `WindowsSecurityNotImplemented`. Then add suites `job-before-resume`, `job-assignment-failure-no-orphan`, `job-kill`, `pipe-acl`, `pipe-peer`, `window-owner`, `window-style`, `window-bounds`, `no-onscreen-window-before-cover-ack`, `window-close-routing`, `prepared-gesture-before-windowpos`, `unprepared-windowpos-latch`, `resize-bands` and `runtime-integrity`. The fake child creates a real top-level window and can deliberately present wrong PID/session/path, send `WM_CLOSE`, stall heartbeat, exit, keep a grandchild alive or open a second pipe.

```powershell
$YueEWindowsSecurityRed = powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\invoke-yue-e-dotnet-project.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Project .\native\windows\yue-e-harness\FeMonster.YueEHostHarness.csproj `
  -Operation Run -Configuration Release -AppMode Suite -Suite windows-security 2>&1 | Out-String
$YueEWindowsSecurityRedExit = $LASTEXITCODE
if ($YueEWindowsSecurityRedExit -eq 0) { throw 'ExpectedWindowsSecurityRed' }
if ($YueEWindowsSecurityRed -notmatch 'WindowsSecurityNotImplemented' -or
    $YueEWindowsSecurityRed -match '(?m)\b(CS|NU)\d{4}\b|ParameterBindingException|ParserError') {
  throw 'UnexpectedWindowsSecurityRed'
}
```

Expected: compile succeeds; behavior assertions fail against stubs. Implement and turn GREEN in Steps 2–6 one suite family at a time; do not defer all GREEN runs to Step 7.

- [ ] **Step 2: Implement race-free process launch and Job ownership.**

The Host obtains exactly one `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` Job from `IYueEJobFactory` and passes a borrowed interface to launcher. Launcher receives only the already integrity-verified `entryExecutableRelativePath` resolved beneath the fixed runtime root, calls suspended `CreateProcessW` on that real target executable, `AssignBeforeResume`, then `ResumeThread`; it never creates/owns/disposes Job and never launches a UE bootstrap wrapper. If argv/entry validation, assignment or resume fails after process creation, launcher calls `TerminateProcess`, bounded-waits, releases only process/thread handles and throws; Host's single failure `finally` disposes its Job exactly once. Closing handles alone is not cleanup for an unjobbed suspended child. Tests prove no sentinel before assignment, no orphan on forced failure, `owner-dispose-once` for Job, bootstrap-path rejection and exact launched image/hash match to the manifest entry.

Run `job-before-resume` and `job-kill` RED → implement → GREEN before continuing.

- [ ] **Step 3: Implement a single-client secure Named Pipe.**

Before launch, create `fe-monster.yuee.<32-lowercase-hex-session>` through `IYueEPipeServerFactory.Create(prelaunchIdentity)` in async byte mode, one instance, no inheritable handles; this freezes header context but no expected UE PID exists yet. Build a DACL allowing current Logon SID and denying Network SID. After launch returns PID, build `YueEExpectedPeer` and call `AcceptVerifiedPeerAsync`; then use `GetNamedPipeClientProcessId`, exact launched PID, normalized executable path and hello session/process generation/host PID/UE PID/build ID. Acceptance requires `CreateProcessW PID == GetNamedPipeClientProcessId == hello.uePid`; a child/grandchild UE PID is never adopted. UE independently verifies `hostPid` still names the launcher. Run `pipe-acl` and `pipe-peer` RED → implement → GREEN.

- [ ] **Step 4: Implement runtime integrity validation.**

`YueERuntimeManifest` validates canonical manifest **bytes embedded as an MSBuild `EmbeddedResource`** in the host. At runtime it constant-time compares the sibling `yue-e-runtime-manifest.json` bytes with the embedded bytes, then verifies every indexed file. It resolves `entryExecutableRelativePath` only beneath the fixed runtime root, requires its bytes to match both `entryExecutableSha256` and the indexed hash, and requires `bootstrapExecutablePresent:false`; exactly that resolved path is returned to the launcher. The canonical runtime file index excludes the manifest itself; `runtimeBuildId` is derived from that excluded index. Do not mix an embedded digest model with this embedded-manifest model. Gate 8 adds Authenticode/publisher policy. Missing/changed/path-traversing/bootstrap/extra executable entries return `RuntimeIntegrityFailed` without leaving Web. Run `runtime-integrity` RED → implement → GREEN, including mutated temp-copy, path traversal, root-bootstrap and receipt-entry substitution tests.

- [ ] **Step 5: Implement the owned top-level contract without `SetParent`.**

Before launch compute `YueEPrewarmPlacement`: final client width/height/DPI at a validated virtual-screen-outside coordinate (within Win32 coordinate limits, no intersection with any monitor work area). Pass it as typed launch args so UE applies position/style before first `ShowWindow`; it must remain shown/non-minimized to obtain Present. Enumerate exact-PID window, require popup/toolwindow styles, attach owner via `GWLP_HWNDPARENT`, and verify the actual rect still has zero monitor intersection; if Windows clamps it onscreen, abort entry before reveal. Never global-topmost/`SetParent`. Publish physical position/size/DPI and strictly increasing `boundsRevision`. Before cover ack, real/fake HWND probes and screen capture must prove no YueE pixel appeared in any monitor work area. After opaque ack, move to main client, emit a new bounds revision, and require three new final-position safe Presents before `scene.reveal`. `Esc`/Alt+F4/WM_CLOSE produce one exit request. Run owner/style/bounds/no-flash/close suites RED → implement → GREEN.

- [ ] **Step 6: Preserve borderless resize with owned resize bands.**

Create eight narrow `NativeWindow` bands owned by the main form and kept immediately above UE in the same owner z-order family. Scale thickness from `NativeWindowChrome.GetResizeFrameSize` for current PerMonitorV2 DPI. The exact border ring is host-exclusive. Bands and the existing custom title-drag surface intercept pointer down, await `PrepareInteractiveLayoutAsync`, and send `WM_NCLBUTTONDOWN` only after the one-time permit proves matching fog-opaque suspend, UE hidden latch armed and owner rect still unchanged; the permit is bound to layout epoch/hit kind, expires in 250ms and is consumed once. Timeout/cancel/reentrant input never begins the native move loop. It does **not** promise cross-process fall-through.

Keyboard snap/maximize/restore, accessibility automation, DPI suggestions and topology changes can bypass that gesture path. Override the main HWND message hook so the first unprepared `WM_SYSCOMMAND` layout command, `WM_WINDOWPOSCHANGING`, `WM_DPICHANGED` or display-topology mutation calls `ConcealBeforeUnpreparedOwnerMutation` synchronously **before** base/DefWindowProc: verify the owned exact-PID HWND, hide it, arm the hidden latch, append the owner/owned physical rects and observation to the journal, then allow the owner mutation. Host consumes that observation as `SystemForced`, sends a fresh suspend and cannot release the latch until matching ack, final bounds and three safe Presents. Tests instrument message order and QPC: before the first owner rect change either owner/UE rects match or UE is hidden; no sample may contain both `OwnedVisible=true` and unequal rects. Tests prove the interior UE content rectangle is uncovered and still receives mouse/keyboard. Hide bands while maximized/fullscreen/minimized/UE hidden and destroy them with the session. Run prepared/unprepared/resize suites RED → implement → GREEN.

- [ ] **Step 7: Run the fake-child security suite GREEN.**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\invoke-yue-e-dotnet-project.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Project .\native\windows\yue-e-harness\FeMonster.YueEHostHarness.csproj `
  -Operation Run -Configuration Release -AppMode Suite -Suite windows-security
if ($LASTEXITCODE -ne 0) { throw "WindowsSecuritySuiteFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-window-contract.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Mode FakeChild -DpiCsv '100,125,150,200' `
  -EvidenceRoot .\out\yue-e\window-fake
if ($LASTEXITCODE -ne 0) { throw "FakeWindowContractFailed:$LASTEXITCODE" }
```

Expected: wrong PID/path/session is rejected; a grandchild dies when the Job closes; the accepted HWND is non-child and owned; no YueE source or runtime trace calls `SetParent` (the existing unrelated `DesktopSceneHost` call remains); UE `WM_CLOSE` requests scene exit without closing the main form; all eight resize directions work at 100%, 125%, 150% and 200% test DPI; controllable gestures cannot begin before suspend/hidden permit, and unprepared OS layout hides UE before the first owner position mutation.

`check-yue-e-window-contract.ps1` is created once with the final parameter set `-Root -Config -Mode <FakeChild|PackagedRuntime> [-PackageRoot] -DpiCsv <string> -EvidenceRoot -SelfTest`; FakeChild omits `PackageRoot`, while PackagedRuntime requires it. `DpiCsv` is one invariant CSV token and must parse exactly four integers `100,125,150,200`; empty, whitespace, duplicate, non-integer or array binding is rejected. Its `-SelfTest` verifies parsing, incompatible combinations and path containment without launching a process. Task 10 invokes its existing packaged mode and does not modify this script.

- [ ] **Step 8: Commit the Windows primitives.**

```powershell
git add -- native/windows/winforms/yue-e native/windows/yue-e-harness `
  scripts/check-yue-e-window-contract.ps1
if (git diff --cached --name-only | Select-String '/(bin|obj)/') { throw 'GeneratedDotnetOutputStaged' }
git diff --cached --check
git commit -m "feat: add secure YueE process and window host"
```

## Task 6: Build the Blender 5.2 Graybox and UE 5.8 DX12 Shell

**Files:**

- Create: `art/blender/yue-e/scripts/create_gate0_test_geometry.py`
- Create: `art/blender/yue-e/scripts/validate_gate0_fbx.py`
- Create: `scripts/yue-e/invoke-yue-e-blender.ps1`
- Generate: `art/blender/yue-e/environment/gate0/yue-e-gate0-test-geometry.blend`
- Generate: `art/blender/yue-e/export/gate0/*.fbx`
- Create: `unreal/YueEWorld/YueEWorld.uproject`
- Create: `unreal/YueEWorld/Config/DefaultEngine.ini`
- Create: `unreal/YueEWorld/Config/DefaultGame.ini`
- Create: `unreal/YueEWorld/Source/YueEWorld.Target.cs`
- Create: `unreal/YueEWorld/Source/YueEWorldEditor.Target.cs`
- Create: `unreal/YueEWorld/Source/YueEWorld/YueEWorld.Build.cs`
- Create: `unreal/YueEWorld/Source/YueEWorld/YueEWorld.cpp`
- Create: `unreal/YueEWorld/Source/YueEWorld/YueEWorld.h`
- Create: `unreal/YueEWorld/Source/YueEWorld/Public/YueEHostProtocol.h`
- Create: `unreal/YueEWorld/Source/YueEWorld/Public/YueEHostBridgeSubsystem.h`
- Create: `unreal/YueEWorld/Source/YueEWorld/Public/Gate0/YueEGate0GameMode.h`
- Create: `unreal/YueEWorld/Source/YueEWorld/Public/Gate0/YueEGate0SpectatorPawn.h`
- Create: `unreal/YueEWorld/Source/YueEWorld/Private/YueEHostProtocol.cpp`
- Create: `unreal/YueEWorld/Source/YueEWorld/Private/YueEHostBridgeSubsystem.cpp`
- Create: `unreal/YueEWorld/Source/YueEWorld/Private/Windows/YueENamedPipeClientWin.cpp`
- Create: `unreal/YueEWorld/Source/YueEWorld/Private/Windows/YueEWindowContractWin.cpp`
- Create: `unreal/YueEWorld/Source/YueEWorld/Private/Windows/YueEPresentHealthProbeWin.cpp`
- Create: `unreal/YueEWorld/Source/YueEWorld/Private/Gate0/YueEGate0GameMode.cpp`
- Create: `unreal/YueEWorld/Source/YueEWorld/Private/Gate0/YueEGate0SpectatorPawn.cpp`
- Create: `unreal/YueEWorld/Source/YueEWorld/Private/Tests/YueEGate0AutomationTests.cpp`
- Create: `contracts/yue-e/ue-gate0-tests-v1.json`
- Create: `scripts/check-yue-e-ue-automation-report.ps1`
- Create: `unreal/YueEWorld/Scripts/create_gate0_map_scaffold.py`
- Create: `unreal/YueEWorld/Scripts/import_gate0_assets.py`
- Generate: `unreal/YueEWorld/Content/YueE/Gate0/*`

- [ ] **Step 1: Write RED Blender source/export validation.**

`validate_gate0_fbx.py` must require a meter-scale, Z-up source with applied transforms and these three stable original meshes required by the design spec:

```text
SM_YueE_FallbackTile   — reusable solid fallback tile
SM_YueE_TestGround     — 20m walkable ground with real thickness
SM_YueE_TestCardFrame  — freestanding large rounded card frame with real thickness
```

Each render mesh must have UV0, non-overlapping lightmap UV1, explicit normals/tangents, positive applied transforms, valid bounds, real thickness and a named simple `UCX_<RenderMesh>_00` collision proxy. The validator parses the binary FBX header/version word and requires Blender's native `7400`; ASCII FBX, a forged 2020.2/version header or any other version fails. Reject zero-thickness/non-manifold collision, duplicate names, cameras/lights, armatures/animations, embedded textures and any final material payload. Optional test arch/crystal may be added only in addition to these stable three and must pass the same rules.

In this Step 1, also implement `invoke-yue-e-blender.ps1` before any RED execution. It has disjoint SelfTest and production parameter sets; production requires `-Root -Config -Script -ScriptRoot`, validates `ScriptRoot` equals the canonical repository root, and constructs `@('--root',$ScriptRoot)` internally. It invokes only the configured hash-bound Blender with `--factory-startup --disable-autoexec --background --python-exit-code 2 --python <validated-script> -- <args>` and isolated portable config. SelfTest uses deliberate-raise and argv-echo fixtures to prove exit mapping, option order and unchanged token delivery. The missing-asset validator loads successfully, prints `Gate0AssetsMissing`, then deliberately exits 2; arbitrary Python failure is not valid RED.

- [ ] **Step 2: Run Blender validation RED.**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\invoke-yue-e-blender.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json -SelfTest
if ($LASTEXITCODE -ne 0) { throw "BlenderInvokerSelfTestFailed:$LASTEXITCODE" }

$YueEBlenderRed = powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\invoke-yue-e-blender.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Script .\art\blender\yue-e\scripts\validate_gate0_fbx.py `
  -ScriptRoot (Get-Location).Path 2>&1 | Out-String
$YueEBlenderRedExit = $LASTEXITCODE
if ($YueEBlenderRedExit -ne 2) { throw "ExpectedBlenderValidationExit2:$YueEBlenderRedExit" }
if ($YueEBlenderRed -notmatch 'Gate0AssetsMissing' -or
    $YueEBlenderRed -match 'Traceback|ParameterBindingException|ParserError') {
  throw 'UnexpectedBlenderValidationRed'
}
```

Expected: exit 2 because the Gate 0 `.blend` and FBXs are absent.

- [ ] **Step 3: Script and generate the original graybox.**

Using the already implemented and self-tested Step 1 invoker, implement `create_gate0_test_geometry.py`: clear the default scene, set metric units, procedurally construct the three required render/collision pairs, bevel visible edges, author UV0/UV1 and custom split normals/tangents, apply transforms, save the `.blend`, and export one FBX per asset with no animation, texture or material. Names/topology/transforms/bounds are content-validated; record actual file hashes because FBX/container bytes may vary even with the locked exporter.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\invoke-yue-e-blender.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Script .\art\blender\yue-e\scripts\create_gate0_test_geometry.py `
  -ScriptRoot (Get-Location).Path
if ($LASTEXITCODE -ne 0) { throw "BlenderGeometryGenerationFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\invoke-yue-e-blender.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Script .\art\blender\yue-e\scripts\validate_gate0_fbx.py `
  -ScriptRoot (Get-Location).Path
if ($LASTEXITCODE -ne 0) { throw "BlenderGeometryValidationFailed:$LASTEXITCODE" }
```

Expected: three required FBXs pass mesh/UV/normal/collision/payload validation; the log records exact Blender 5.2.0 and actual content hashes. No character is created in Gate 0.

- [ ] **Step 4: Create a minimal compile-green UE project/module scaffold.**

Create `YueEWorld.cpp/.h`, both targets, Build.cs, `YueEGate0GameMode.h/.cpp` and `YueEGate0SpectatorPawn.h/.cpp` with minimal implementations; enable `PythonScriptPlugin` and `EditorScriptingUtilities` in `.uproject`. Resolve UE/VS only from `.yue-e-local.json` via the toolchain script. If project files are required, invoke the configured UE `GenerateProjectFiles.bat` with independent arguments `-project=<absolute uproject> -game -engine -2022`; never use its default compiler alias. Build `YueEWorldEditor Win64 Development -Compiler=VisualStudio2022` once to GREEN before tests reference behavioral classes, parse UBT output and require the actual compiler is VS2022/17.x and its resolved install root equals configured `visualStudioInstallRoot`.

Do not point startup config at a missing package. After that build, run tracked `create_gate0_map_scaffold.py` through the configured `UnrealEditor-Cmd.exe` with explicit existing `/Engine/Maps/Entry`, `-unattended -nop4 -nosplash -run=pythonscript`, the script path and the same isolated user/Saved/log/shader/DDC arguments. The script idempotently creates and saves `/Game/YueE/Gate0/L_YueE_Gate0` with only WorldSettings plus the compile-green `YueEGate0GameMode`/pawn classes—no visible test geometry—and reloads it successfully. Only after that `.umap` exists, author tracked `DefaultEngine.ini` with `[/Script/EngineSettings.GameMapsSettings]`, `GameDefaultMap=/Game/YueE/Gate0/L_YueE_Gate0`, `EditorStartupMap=/Game/YueE/Gate0/L_YueE_Gate0` and `GlobalDefaultGameMode=/Script/YueEWorld.YueEGate0GameMode`; no generated/user config may override these values in Gate mode. Launch one isolated Editor probe without an explicit map and require the actual world package is the scaffold. Step 5 RED must contain no missing-map/load/config error; Step 8 fills this existing scaffold rather than creating the package for the first time.

- [ ] **Step 5: Add RED UE automation tests against compile-green stubs.**

Every compile-green stub failure emits the stable automation assertion token `YueEGate0NotImplemented`; a compiler/load/configuration failure is not an acceptable RED.

`ue-gate0-tests-v1.json` freezes exactly eleven IDs: `YueE.Gate0.FixtureParity`, `DX12Settings`, `ImportedMeshContract`, `PawnNavigation`, `NoSongAudio`, `CommandLineValidation`, `StateCapabilityRejection`, `PresentHealth`, `UserDirectoryContainment`, `EvidenceMarker`, and `VideoMemoryCounters` (each with the full `YueE.Gate0.` prefix). `check-yue-e-ue-automation-report.ps1 -Root -ExpectedManifest -ReportRoot -ExpectedOutcome <Red|Green> -SelfTest` parses the exported UE JSON report, requires the exact set/count with no duplicate, skipped, not-run or unknown test, and binds the reported RHI to D3D12. Red requires all eleven discovered tests and at least one deliberate assertion failure containing `YueEGate0NotImplemented`, with no compile/load/module error; Green requires all eleven `Success`. Its self-test covers zero-match, partial, duplicate, skipped, unknown, wrong-RHI and forged summary fixtures.

The report checker also requires the current `.yue-e-run.json` sentinel, rejects every report file older than its start QPC/time, and records the exact report inventory hash; a prior run can never satisfy a new invocation.

Create tests under `YueE.Gate0` for fixture parity, required DX12 settings, imported mesh scale/bounds/collision, active-only pawn navigation, no song `AudioComponent`, window command-line validation, state/capability rejection, and present-health behavior. The present test must prove that tick/render-submission alone does not emit `frame.safe`. Path tests fail unless the Host-supplied typed UE user directory is absolute/reparse-free/beneath the stable state root and `FPaths::ProjectUserDir`, `ProjectSavedDir`, `ProjectLogDir`, generated config, crash output, PSO cache, shader working directory and local DDC all resolve beneath it; default package-relative or global-user fallbacks are RED. Internal-evidence tests also require a dedicated marker thread whose one long CPU scope is properly nested and never opened on Game/Render/TaskGraph threads, plus a separate UE-process DXGI memory sampler whose trace counters bind exact UE PID/process generation.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-ue-automation-report.ps1 `
  -Root (Get-Location).Path -SelfTest
if ($LASTEXITCODE -ne 0) { throw "UnrealAutomationReportSelfTestFailed:$LASTEXITCODE" }
$YueERoot = (Get-Location).Path
$YueEConfig = Get-Content .\.yue-e-local.json | ConvertFrom-Json
$YueERedBuildLogRoot = Join-Path $YueERoot 'out\yue-e\gate-child-logs\ue-automation-red-build'
$YueERedTestLogRoot = Join-Path $YueERoot 'out\yue-e\gate-child-logs\ue-automation-red-test'
. .\scripts\yue-e\gate-child-environment.ps1
$YueEBuildResult = Invoke-YueEGateChildProcess -Kind Unreal -Root $YueERoot `
  -Executable (Join-Path $YueEConfig.unrealInstallRoot 'Engine\Build\BatchFiles\Build.bat') `
  -ArgumentList @('YueEWorldEditor','Win64','Development',
    "-Project=$YueERoot\unreal\YueEWorld\YueEWorld.uproject",
    '-Compiler=VisualStudio2022','-WaitMutex','-NoHotReload') `
  -WorkingDirectory $YueERoot -OutputMode Build -LogRoot $YueERedBuildLogRoot
if ($YueEBuildResult.ExitCode -ne 0) { throw "UnrealBuildFailed:$($YueEBuildResult.ExitCode)" }
$YueERedReport = New-YueEGateRunDirectory -Root $YueERoot `
  -Parent (Join-Path $YueERoot 'out\yue-e\ue-automation-red') -Purpose 'ue-automation-red'
$YueERedUserDir = New-YueEGateRunDirectory -Root $YueERoot `
  -Parent (Join-Path $YueERoot 'out\yue-e\ue-user-red') -Purpose 'ue-user-red'
$YueERedTest = Invoke-YueEGateChildProcess -Kind Unreal -Root $YueERoot `
  -Executable (Join-Path $YueEConfig.unrealInstallRoot 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe') `
  -ArgumentList @("$YueERoot\unreal\YueEWorld\YueEWorld.uproject",
    '-unattended','-nop4','-nosplash','-d3d12','-YueEGate0Automation',
    "-YueEUserDir=$YueERedUserDir",'-SaveToUserDir',"-UserDir=$YueERedUserDir",
    "-ABSLOG=$YueERedUserDir\Saved\Logs\YueEWorld.log",
    "-ShaderWorkingDir=$YueERedUserDir\Saved\ShaderWorking",
    "-LocalDataCachePath=$YueERedUserDir\Saved\DerivedDataCache",'-SharedDataCachePath=None',
    '-ExecCmds=Automation RunTests YueE.Gate0;Quit',
    '-TestExit=Automation Test Queue Empty',"-ReportExportPath=$YueERedReport") `
  -WorkingDirectory $YueERoot -OutputMode Build -LogRoot $YueERedTestLogRoot
if ($YueERedTest.ExitCode -eq 0) { throw 'ExpectedUnrealAutomationRed' }
$YueERedDiagnostic = $YueERedTest.SanitizedHead + "`n" + $YueERedTest.SanitizedTail
if ($YueERedDiagnostic -notmatch 'YueE\.Gate0' -or
    $YueERedDiagnostic -notmatch 'YueEGate0NotImplemented') {
  throw 'UnexpectedUnrealAutomationRed'
}
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-ue-automation-report.ps1 `
  -Root $YueERoot `
  -ExpectedManifest .\contracts\yue-e\ue-gate0-tests-v1.json `
  -ReportRoot $YueERedReport -ExpectedOutcome Red
if ($LASTEXITCODE -ne 0) { throw "UnrealAutomationRedInventoryFailed:$LASTEXITCODE" }
```

Expected: build succeeds; `YueE.Gate0` behavior assertions fail against stubs. Run each fixture/bootstrap/present/import suite RED before its matching implementation.

- [ ] **Step 6: Implement the UE protocol/bootstrap suites to GREEN.**

`-YueEGate0Automation` is accepted only by the Development Editor target when `WITH_DEV_AUTOMATION_TESTS` is compiled. It suppresses production Host-pipe startup but still requires the full standard/custom isolated user-directory arguments shown in both automation commands and performs actual Saved/Logs/Config/Crashes/PSO/shader/DDC sentinel writes there. Shipping/game targets reject the switch. Command-line/session/build validation tests exercise the production parser with explicit fixture argv rather than weakening startup validation.

Launcher passes the fixed first map token `/Game/YueE/Gate0/L_YueE_Gate0`, then separate quoted args `-YueEPipe`, `-YueESession`, `-YueEGeneration`, `-YueEHostPid`, `-YueEBuildId`, `-YueEPrewarmX`, `-YueEPrewarmY`, `-YueEPrewarmWidth`, `-YueEPrewarmHeight`, `-YueEPrewarmDpiX`, `-YueEPrewarmDpiY`, `-YueEBoundsRevision`, and `-YueEUserDir`, plus UE's matching `-windowed -ForceRes -WinX -WinY -ResX -ResY`. It rejects any caller-supplied map/URL token. `-YueEUserDir` is not a user override: Host alone derives `<stableStateRoot>/runtime/yue-e/<runtimeBuildId>/<sessionId>`, creates the reparse-free directories before launch, and passes the same canonical path through standard `-SaveToUserDir "-UserDir=<path>" "-ABSLOG=<path>/Saved/Logs/YueEWorld.log" "-ShaderWorkingDir=<path>/Saved/ShaderWorking" "-LocalDataCachePath=<path>/Saved/DerivedDataCache" -SharedDataCachePath=None`. UE parses the custom value before hello and proves every corresponding `FPaths` directory is contained beneath it; mismatch/default fallback aborts before render or IPC acceptance. X/Y are signed 32-bit physical pixels; width/height 320..16384; DPI 96..960; revision 1..JS-safe-max. UE's standard switches place/size the window before first show, while custom values are parsed/compared before hello; missing/malformed/mismatch/clamped-on-monitor placement aborts. Before hello it requires `GetWorld()->GetOutermost()->GetName()` and the authoritative package name to equal `/Game/YueE/Gate0/L_YueE_Gate0`; `hello.loadedMapPackage` carries that exact value and Host rejects anything else. Fixtures cover every missing/range/quoting/clamp/path-containment/map-override case and actual writes to Saved/Logs/Config/Crashes/PSO/shader/DDC sentinels. Then verify host/PID/path/map, pipe capabilities/heartbeat. `scene.reveal` clears fog in 900ms; `scene.suspend` raises fog in 300ms, freezes input and reports `suspendReady` only when opaque/quiescent; exit request freezes input; prepareExit reverses any reveal/raises fog and only then replies. Reliable `shutdown` first flushes `command.result(accepted)` for the matching command, then requests clean process self-exit; Tick/timeout cannot fake any completion.

For the Gate evidence run only, `YueEHostBridgeSubsystem` owns `YueE-G0-EvidenceMarker`, a dedicated blocking `FRunnable` that performs no tick/TaskGraph work and opens no other manual CPU scope between markers. After the Game Thread has flushed `revealReady`, it signals the marker thread; that thread begins exactly one Trace Region `YUEE_G0_ACTIVE`, opens exactly one nested CPU event `YUEE_G0_ACTIVE_WINDOW`, and blocks on its stop event. Accepted `scene.prepareExit` or any fault/finally signals stop; the marker thread closes the CPU event, then the Region, exactly once and acknowledges completion. A distinct `YueE-G0-MemorySampler` thread samples once per second from the same DXGI adapter/node as the running RHI by calling `IDXGIAdapter3::QueryVideoMemoryInfo(DXGI_MEMORY_SEGMENT_GROUP_LOCAL)` **inside YueEWorld.exe** and emits trace counters `YueE.UEProcess.LocalVideoMemoryUsageBytes`, `YueE.UEProcess.LocalVideoMemoryBudgetBytes`, `YueE.UEProcess.Pid` and `YueE.UEProcess.ProcessGeneration`. Host-process DXGI values are never substituted. Automation proves the marker's LIFO depth/thread name, forced-finally pairing, successful current-process DXGI query and exact PID/generation counters.

Implement `YueEGate0SpectatorPawn` as the Gate 0 non-combat camera body rather than inheriting default no-collision spectator behavior. Its collision-enabled root and movement component perform frame-rate-independent accelerated/damped WASD plus mouse yaw/pitch and explicit ascend/descend using swept movement; input mapping exists only during the Host-confirmed Active/revealed state and is removed/frozen during fog, suspend, exit and fault. `YueE.Gate0.PawnNavigation` first runs RED against the compile-green stub. At this Step 6 point, make its asset-independent input/state/frame-rate subcases GREEN, but keep the top-level suite deliberately RED with `YueEGate0NotImplemented:PawnNavigationAssetsPending` because the Step 4 scaffold intentionally has no test solids; do not fake collision/render results. After Step 8 fills the map, the complete suite injects the typed input path at 30/60/120Hz and compares bounded final transforms, verifies pitch/yaw and near/far/overhead traversal, sweeps into each of the three Blender collision solids and requires blocking hits with zero penetration/tunneling, then captures two fixed D3D12 render-target samples at controlled camera/light poses and requires non-flat normal response plus changed specular/highlight and cast-shadow masks on all three solids. It rejects `NoCollision`, teleport movement, input while non-Active, missing normals/tangents, unlit/flat materials or a solid that can be crossed. Task 10's real movement beat and final matrix bind to the same eleven-test manifest/report hash.

- [ ] **Step 7: Implement real Present health and make only that suite GREEN.**

On Win64/DX12, obtain the runtime viewport's native DXGI swap chain through the RHI-native interface. Poll the native present serial/statistics after render completion and count only strictly increasing values while device state is healthy, final-size resources are ready and the window is non-minimized. Reset on bounds revision, swap-chain recreation (new epoch), device error, duplicate serial, size mismatch or asset-not-ready. Emit the exact `frame.safe` payload (`boundsRevision`, `swapChainEpoch`, `presentSerial`, render size, frameTimeMs, resourceReady); never emit from game/Slate tick alone.

The real integration test in Task 10 is authoritative if a driver/RHI does not expose reliable native statistics; in that case Gate 0 remains failed rather than substituting a tick.

- [ ] **Step 8: Import FBX explicitly, verify assets, then assemble the shell map.**

`import_gate0_assets.py` uses `Import Materials=false`, `Import Textures=false`, `Import Animations=false`, verifies 1m → 100cm bounds, UV channels, collision and assigns UE-created material assets. Invoke it explicitly before automation:

```powershell
$YueERoot = (Get-Location).Path
$YueEConfig = Get-Content .\.yue-e-local.json | ConvertFrom-Json
$YueEImportLogRoot = Join-Path $YueERoot 'out\yue-e\gate-child-logs\ue-import'
. .\scripts\yue-e\gate-child-environment.ps1
$YueEImportResult = Invoke-YueEGateChildProcess -Kind Unreal -Root $YueERoot `
  -Executable (Join-Path $YueEConfig.unrealInstallRoot 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe') `
  -ArgumentList @("$YueERoot\unreal\YueEWorld\YueEWorld.uproject",
    '-unattended','-nop4','-nosplash','-run=pythonscript',
    "-script=$YueERoot\unreal\YueEWorld\Scripts\import_gate0_assets.py",
    "-YueERoot=$YueERoot","-YueEConfig=$YueERoot\.yue-e-local.json") `
  -WorkingDirectory $YueERoot -OutputMode Build -LogRoot $YueEImportLogRoot
if ($YueEImportResult.ExitCode -ne 0) { throw "UnrealImportFailed:$($YueEImportResult.ExitCode)" }
```

The Python script parses/validates both arguments, loads local config, imports the three version-7400 FBXs through UE 5.8's FBX 2020.2 importer with import warnings/errors captured as Gate failures, creates UE-owned materials, then loads and idempotently **fills and saves the existing Step 4 scaffold** `Content/YueE/Gate0/L_YueE_Gate0.umap` with the three solids, collision, `YueEGate0SpectatorPawn`, warm directional light, cool skylight, Lumen, VSM, volumetric fog and matching entry fog. It rejects a missing/replaced scaffold or package-name drift. The world override and tracked `GameMapsSettings` must both select `YueEGate0GameMode` and this exact map. Disable film grain/chromatic aberration/motion blur/dynamic resolution; use native 100%. Fail unless all three `.uasset` files and the saved `.umap` exist and pass an EditorAssetLibrary reload plus exact bounds/UV/collision/tangent comparison before automation. The `FixtureParity` and `PawnNavigation` automation suites load this package, assert the actual world/package/game-mode/pawn classes, and reject Engine Entry or an empty/default world. Immediately after import/reload, run the complete focused `YueE.Gate0.PawnNavigation` suite with DX12 and require GREEN before Step 9; this is the first point where the collision/light/render assertions can legitimately pass. Enable PSO precaching; asset-ready waits for shader/PSO, collision and final-size resources.

- [ ] **Step 9: Run all UE automation GREEN using DX12.**

```powershell
$YueERoot = (Get-Location).Path
$YueEConfig = Get-Content .\.yue-e-local.json | ConvertFrom-Json
$YueEGreenBuildLogRoot = Join-Path $YueERoot 'out\yue-e\gate-child-logs\ue-automation-green-build'
$YueEGreenTestLogRoot = Join-Path $YueERoot 'out\yue-e\gate-child-logs\ue-automation-green-test'
. .\scripts\yue-e\gate-child-environment.ps1
$YueEGreenReport = New-YueEGateRunDirectory -Root $YueERoot `
  -Parent (Join-Path $YueERoot 'out\yue-e\ue-automation-green') -Purpose 'ue-automation-green'
$YueEGreenUserDir = New-YueEGateRunDirectory -Root $YueERoot `
  -Parent (Join-Path $YueERoot 'out\yue-e\ue-user-green') -Purpose 'ue-user-green'
$YueEBuildResult = Invoke-YueEGateChildProcess -Kind Unreal -Root $YueERoot `
  -Executable (Join-Path $YueEConfig.unrealInstallRoot 'Engine\Build\BatchFiles\Build.bat') `
  -ArgumentList @('YueEWorldEditor','Win64','Development',
    "-Project=$YueERoot\unreal\YueEWorld\YueEWorld.uproject",
    '-Compiler=VisualStudio2022','-WaitMutex','-NoHotReload') `
  -WorkingDirectory $YueERoot -OutputMode Build -LogRoot $YueEGreenBuildLogRoot
if ($YueEBuildResult.ExitCode -ne 0) { throw "UnrealBuildFailed:$($YueEBuildResult.ExitCode)" }
$YueETestResult = Invoke-YueEGateChildProcess -Kind Unreal -Root $YueERoot `
  -Executable (Join-Path $YueEConfig.unrealInstallRoot 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe') `
  -ArgumentList @("$YueERoot\unreal\YueEWorld\YueEWorld.uproject",
    '-unattended','-nop4','-nosplash','-d3d12','-YueEGate0Automation',
    "-YueEUserDir=$YueEGreenUserDir",'-SaveToUserDir',"-UserDir=$YueEGreenUserDir",
    "-ABSLOG=$YueEGreenUserDir\Saved\Logs\YueEWorld.log",
    "-ShaderWorkingDir=$YueEGreenUserDir\Saved\ShaderWorking",
    "-LocalDataCachePath=$YueEGreenUserDir\Saved\DerivedDataCache",'-SharedDataCachePath=None',
    '-ExecCmds=Automation RunTests YueE.Gate0;Quit',
    '-TestExit=Automation Test Queue Empty',
    "-ReportExportPath=$YueEGreenReport") `
  -WorkingDirectory $YueERoot -OutputMode Build -LogRoot $YueEGreenTestLogRoot
if ($YueETestResult.ExitCode -ne 0) { throw "UnrealAutomationFailed:$($YueETestResult.ExitCode)" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-ue-automation-report.ps1 `
  -Root $YueERoot `
  -ExpectedManifest .\contracts\yue-e\ue-gate0-tests-v1.json `
  -ReportRoot $YueEGreenReport `
  -ExpectedOutcome Green
if ($LASTEXITCODE -ne 0) { throw "UnrealAutomationGreenInventoryFailed:$LASTEXITCODE" }
```

Expected: every `YueE.Gate0` test passes; output confirms D3D12, no song audio component, correct FBX scale and no tick-derived safe frame. Do not add `-NullRHI`.

- [ ] **Step 10: Commit source plus LFS-backed Gate 0 source assets.**

```powershell
git add -- art/blender/yue-e unreal/YueEWorld `
  scripts/yue-e/invoke-yue-e-blender.ps1 `
  scripts/check-yue-e-ue-automation-report.ps1 `
  contracts/yue-e/ue-gate0-tests-v1.json
if (git diff --cached --name-only | Select-String '(^|/)(Binaries|Intermediate|Saved|DerivedDataCache|\.vs)/|\.sln$') { throw 'GeneratedUnrealOutputStaged' }
git lfs status
git diff --cached --check
git commit -m "feat: add YueE UE5 Gate 0 shell"
```

Expected: `.blend`, `.fbx`, `.uasset` and `.umap` are LFS pointers; UE generated `Binaries/Intermediate/Saved/DerivedDataCache` are absent from the index.

## Task 7: Package a Content-Addressed Win64 YueE Runtime

**Files:**

- Create: `scripts/yue-e/build-yue-e-runtime.ps1`
- Create: `scripts/check-yue-e-runtime-package.ps1`
- Generate: `runtime/yue-e/*`
- Generate: `runtime/yue-e/yue-e-runtime-manifest.json`
- Generate: `out/yue-e/runtime-build-receipt.json`

- [ ] **Step 1: Write a RED packaged-runtime checker.**

The checker must require the manifest-named real YueE target executable, all packaged dependencies, `yue-e-runtime-manifest.json`, Win64 PE architecture, no Editor modules, no source/intermediate files, `/Game/YueE/Gate0/L_YueE_Gate0` in the cooked asset registry, staged `GameMapsSettings` whose `GameDefaultMap` and `EditorStartupMap` equal that package and whose global GameMode is `YueEGate0GameMode`, DX12 as the required RHI, and no media/song assets or UE main-song Audio Component. It rejects a root/bootstrap launcher, an entry not present as the unique game `Executable` in the frozen UE TargetReceipt, any archived entry whose bytes differ from that receipt build product, a staging record sourced from `BootstrapPackagedGame-*`, or a config/command-line path that can select Engine Entry/another map in Gate mode.

```powershell
$YueERuntimeRed = powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-runtime-package.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json 2>&1 | Out-String
$YueERuntimeRedExit = $LASTEXITCODE
if ($YueERuntimeRedExit -eq 0) { throw 'ExpectedRuntimePackageRed' }
if ($YueERuntimeRed -notmatch 'RuntimeMissing' -or
    $YueERuntimeRed -match 'ParameterBindingException|ParserError') {
  throw 'UnexpectedRuntimePackageRed'
}
```

Expected: non-zero with `RuntimeMissing`.

- [ ] **Step 2: Implement the one-command runtime build.**

`build-yue-e-runtime.ps1` accepts `-Root -Config -Configuration [-RefreshAssets]`, loads tool paths from config, runs preflight, validates Blender/FBX content, performs the explicit import when requested, verifies tracked imports otherwise, builds UE, runs `YueE.Gate0`, then calls UAT without a shell-concatenated argument string:

Before UAT it must invoke the frozen UE report checker in Green mode and bind the expected-test manifest hash, exact eleven-test report hash/count, exact loaded Gate map package and D3D12 result into `runtime-build-receipt.json`; a zero-match, partial report or alternate loaded world cannot be packaged.

```powershell
$YueERoot = (Get-Location).Path
$YueEConfig = Get-Content .\.yue-e-local.json | ConvertFrom-Json
$YueEUatLogRoot = Join-Path $YueERoot 'out\yue-e\gate-child-logs\uat'
. .\scripts\yue-e\gate-child-environment.ps1
$YueEUatResult = Invoke-YueEGateChildProcess -Kind Unreal -Root $YueERoot `
  -Executable (Join-Path $YueEConfig.unrealInstallRoot 'Engine\Build\BatchFiles\RunUAT.bat') `
  -ArgumentList @('BuildCookRun',
    "-project=$YueERoot\unreal\YueEWorld\YueEWorld.uproject",
    '-nop4','-unattended','-platform=Win64','-clientconfig=Development',
    '-ubtargs=-Compiler=VisualStudio2022',
    '-build','-cook','-allmaps','-stage','-pak','-iostore','-archive','-NoBootstrapExe',
    "-archivedirectory=$YueERoot\out\yue-e\uat") `
  -WorkingDirectory $YueERoot -OutputMode Build -LogRoot $YueEUatLogRoot
if ($YueEUatResult.ExitCode -ne 0) { throw "UnrealPackageFailed:$($YueEUatResult.ExitCode)" }
```

Every internal `Build.bat` call in `build-yue-e-runtime.ps1` also passes independent `-Compiler=VisualStudio2022`; every project-file generation passes `-2022`; UAT receives the one separately quoted `-ubtargs=-Compiler=VisualStudio2022` token and the independent `-NoBootstrapExe` token shown above. Capture UBT/UAT logs and write `out/yue-e/runtime-build-receipt.json` with `compiler:"VisualStudio2022"`, VS product/MSVC versions, `installRootMatchesConfig:true`, tool executable hashes and output hashes; reject any VS2026/default-alias selection or actual tool path outside configured VS17. After UAT, parse the UE 5.8 TargetReceipt plus the generated staging manifest, require exactly one game-target `Executable` build product, require its archived bytes to equal that original build product byte-for-byte, reject every mapping sourced from `BootstrapPackagedGame-*`, and freeze its normalized archive-relative path/hash plus both receipt/manifest hashes. Normalize the archive into `runtime/yue-e/` without changing the package bytes or relocating/renaming the executable. `-RefreshAssets` may run the explicit import script; default builds verify tracked imported assets against FBX source hashes and fail on drift rather than silently modifying the worktree.

- [ ] **Step 3: Generate the canonical runtime manifest.**

Sort relative paths ordinally and record build configuration, Git commit, UE version/CL, Blender version, `compiler: "VisualStudio2022"`, sanitized MSVC version, target/RHI, FBX source hashes, packaged file sizes and SHA-256. Add required fields `entryExecutableRelativePath`, `entryExecutableSha256`, `targetReceiptSha256`, `stagingManifestSha256`, `startupMapPackage:"/Game/YueE/Gate0/L_YueE_Gate0"`, `gameModeClass:"/Script/YueEWorld.YueEGate0GameMode"` and `bootstrapExecutablePresent:false`; the entry path is the frozen reparse-free relative path proven from the TargetReceipt/staging mapping above, never a caller override. The private VS install path remains only in local build validation/receipt as the boolean exact-config match and is not serialized into protected runtime bytes. The canonical file index explicitly excludes `yue-e-runtime-manifest.json`; derive the runtime identity from that excluded index:

```text
runtimeBuildId = ue-g0-<12-char-git-commit>-<12-char-runtime-file-index-sha256>
```

Serialize canonical manifest bytes once (UTF-8 without BOM, LF, ordinal keys/arrays) and use those same bytes as the future host `EmbeddedResource`; never rewrite it after host build. Do not include timestamps, absolute paths or usernames in identity/protected bytes. The final Gate package build ID is calculated in Task 10 after the manifest-pinned host/application payload exist.

- [ ] **Step 4: Build and check GREEN.**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\build-yue-e-runtime.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Configuration Development
if ($LASTEXITCODE -ne 0) { throw "YueERuntimeBuildFailed:$LASTEXITCODE" }

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-runtime-package.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json
if ($LASTEXITCODE -ne 0) { throw "YueERuntimePackageCheckFailed:$LASTEXITCODE" }
```

Expected: both exit 0; checker prints the content-addressed runtime build ID and manifest-named real target executable hash, proves `bootstrapExecutablePresent:false`, and `git status --short` contains no generated runtime or UE intermediates.

- [ ] **Step 5: Commit build logic, not packaged binaries.**

```powershell
git add -- scripts/yue-e/build-yue-e-runtime.ps1 `
  scripts/check-yue-e-runtime-package.ps1
git diff --cached --check
git commit -m "build: package YueE Gate 0 runtime"
```

## Task 8: Add the Embedded “场景” Entry and Visual-Only Web Suspension

**Files:**

- Create: `web/yue-e-host-bridge.js`
- Create: `web/yue-e-host-bridge.css`
- Modify: `web/index.html`
- Modify: `web/styles.css`
- Modify: `web/app.js`
- Modify: `web/soundscape-runtime.js`
- Modify: `web/assets/soundscape-workshop/bridge.js`
- Modify: `web/assets/soundscape-workshop/runtime.html`
- Modify: `web/assets/soundscape-workshop/assets/index-CSU_B_T9.js`
- Create: `scripts/check-yue-e-web-contract.mjs`
- Create: `scripts/check-yue-e-web-bridge.mjs`
- Create: `scripts/check-yue-e-player-continuity.mjs`
- Create: `scripts/rewrite-soundscape-workshop-scheduler.mjs`
- Modify: `web/cache-fingerprints.json`
- Modify: `scripts/check-web-cache-fingerprints.mjs`
- Modify: `scripts/check-soundscape-workshop-runtime.mjs`
- Modify: `scripts/check-audio-playback-continuity.mjs`
- Modify: `scripts/check-sonic-topography-wallpaper-engine-preset.mjs`
- Modify: `scripts/check-player-queue-pagination.mjs`

- [ ] **Step 1: Write RED static Web contract tests.**

Require `#yueEButton` immediately beside `#sandboxModeButton` in one fixed button group, `#yueETransitionCover`, a unique `fe-yue-e-*` family, embedded-client gating, and manifest source selectors. Reject `Audio`, `new Audio`, `.play(`, `.pause(`, `.load(`, `.src =`, `.currentTime =`, `suspendAudioAnalysis`, `clearRealtimePolling`, `setSandboxOpen(false)`, `setDiyOpen(false)` and `fe-desktop-scene` from the YueE bridge.

```powershell
. .\scripts\yue-e\invoke-yue-e-node-script.ps1
$YueEWebContractRed = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
  -Config .\.yue-e-local.json -Mode Provisioned `
  -Script .\scripts\check-yue-e-web-contract.mjs `
  -ArgumentList @('--config','.yue-e-local.json')
if ($YueEWebContractRed.ExitCode -eq 0) { throw 'ExpectedWebContractRed' }
$YueEWebContractRedText = [Text.Encoding]::UTF8.GetString($YueEWebContractRed.StdoutBytes) + "`n" +
  [Text.Encoding]::UTF8.GetString($YueEWebContractRed.StderrBytes)
if ($YueEWebContractRedText -notmatch 'YueEWebEntryMissing' -or
    $YueEWebContractRedText -match 'SyntaxError|ERR_MODULE_NOT_FOUND|ConfigMissing') {
  throw 'UnexpectedWebContractRed'
}
```

Expected: non-zero with stable `YueEWebEntryMissing` because entry/bridge/cover are absent; the checker emits it only after syntax/config/bootstrap validation.

- [ ] **Step 2: Write RED pure-JS bridge behavior tests.**

Against fake WebView/iframe, cover duplicate click, stale identities/revisions, cover correlation, malformed/dispose/focus, plus suspension followed by play/refresh/resize/visibility callbacks. While suspended every decorative scheduler must remain at zero new RAF/timer callbacks even when those triggers fire; health/player polling continues. Resume only runtimes captured active before suspension, exactly once. The RED static fixture scans the real frozen Workshop bundle and must initially fail on its three `window.setTimeout` plus one `window.clearTimeout` scheduler escapes; it also rejects any callable `window|self|globalThis` qualified RAF/timer escape after rewrite.

```powershell
. .\scripts\yue-e\invoke-yue-e-node-script.ps1
$YueEWebBridgeRed = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
  -Config .\.yue-e-local.json -Mode Provisioned `
  -Script .\scripts\check-yue-e-web-bridge.mjs `
  -ArgumentList @('--config','.yue-e-local.json')
if ($YueEWebBridgeRed.ExitCode -eq 0) { throw 'ExpectedWebBridgeRed' }
$YueEWebBridgeRedText = [Text.Encoding]::UTF8.GetString($YueEWebBridgeRed.StdoutBytes) + "`n" +
  [Text.Encoding]::UTF8.GetString($YueEWebBridgeRed.StderrBytes)
if ($YueEWebBridgeRedText -notmatch 'YueEWebBridgeMissing' -or
    $YueEWebBridgeRedText -match 'SyntaxError|ERR_MODULE_NOT_FOUND|ConfigMissing') {
  throw 'UnexpectedWebBridgeRed'
}
```

Expected: non-zero with stable `YueEWebBridgeMissing` because `createYueEHostBridge` is absent; an import/parser/config error is not acceptable RED evidence.

- [ ] **Step 3: Add the button group and opaque cloud cover.**

Move sandbox into a shared fixed group without changing semantics; add same-level “场景” after it. Add an inert pointer-blocking cloud cover above Web and below owned UE. Load bridge after `app-command.js`/before `app.js`. Transition in exactly `900ms` (reduced motion may complete immediately but still ack). Once entry reaches opaque, keep the Web cover opaque through `Revealing` and the entire `Active` lifetime; UE hides/reveals over it. Only after normal exit's UE fog is opaque and UE HWND is hidden may Host command it clear. Therefore sudden UE process/window loss immediately exposes fog, never raw Web/black. Hide/disable entry for non-main embedded modes.

- [ ] **Step 4: Implement the narrow WebView transport.**

Expose:

```js
createYueEHostBridge({
  webview, button, cover,
  setVisualSuspended,
  focusFallback,
  createRequestId
})
```

Return `handleHostMessage`, `requestEnter`, `requestExit`, `requestRetry`, `snapshot` and idempotent `dispose`. All actions carry request ID, `webViewGeneration`, navigation nonce and latest `expectedStateRevision`; `enter` carries no old session, while `exit/retry` also carry current session/process-generation/activation triple. Validate host state and correlate cover by exact request/session/process/activation/WebView/nonce tuple. Only matching Web ack completes cover; no timeout reveals not-ready UE.

- [ ] **Step 5: Add a visual-only suspension flag.**

Implement idempotent `setYueEVisualSuspended`. Add the flag guard to **every** sandbox/orb/cover-particle schedule entry, frame tail and play/refresh/resize callback—not only cancel current IDs—so events cannot restart them. Snapshot which runtimes were active, cancel/pause, and resume only that set once. Preserve the Workshop iframe's existing opaque sandbox exactly as `sandbox="allow-scripts"`; never add `allow-same-origin`. Parent `soundscape-runtime.js` places the canonical expected parent origin plus a per-iframe 32-hex instance nonce in a URL-fragment bootstrap, then must use `postMessage(..., "*")` for parent→opaque-child delivery. Child `bridge.js` reads that immutable bootstrap before bundle load and accepts `fe-yue-e-visual-suspend/v1` only when `event.source === parent`, `event.origin === expectedParentOrigin` and nonce matches; child→parent replies use the exact expected parent target origin, never `*`.

Do **not** monkey-patch `window.requestAnimationFrame`, `setTimeout` or `setInterval`: their identities remain native. Instead, retire the current classic-script branch and always use the existing nonce/origin-bound `bundle-request → bundle-source → Function runner` path. The parent loads only the fixed, cache-fingerprint-verified Workshop bundle asset and replies to the exact iframe/nonce; the opaque child accepts one source only from its validated parent source/origin/nonce. Pass a bridge-owned scheduler façade as lexical `requestAnimationFrame/cancelAnimationFrame/setTimeout/clearTimeout/setInterval/clearInterval` parameters to that runner. The façade tracks bundle-owned callbacks, suppresses new/callback-tail scheduling while suspended, resumes only the prior active generation once, and clears every owned handle on dispose. The separately pre-captured native health RAF/heartbeat bypasses this façade and continues.

The frozen bundle currently has SHA-256 `E84063E440609AAE4DAD2B728FB8E419F78ABC7E37D8E030F3067DBD90183FEB` and exactly four qualified timer tokens at UTF-8 byte offsets 1212282 (`window.clearTimeout`), 1212307, 1253069 and 1253095 (the latter three `window.setTimeout`). `rewrite-soundscape-workshop-scheduler.mjs` is the only permitted bundle edit: it first verifies source hash, byte length/offset/context and exact occurrence counts, replaces only the four `window.` prefixes in descending-offset order so those calls bind to the lexical façade, then verifies output byte length 1264041, SHA-256 `619F24C05D25B63AF7AB2FE8D27A8C964579752CD984B23E6A3EE7393404D779`, `node --check`, and zero qualified scheduler escapes. Any source drift or fifth match fails instead of broad search/replace. Runtime tests exercise both the rewritten debounce and fps-limited recursive-timeout branches through suspend/resume/dispose and prove their callback tails cannot bypass the façade. Fixed asset URL/hash and load/error behavior remain verified; no caller-supplied URL or uncorrelated arbitrary source/eval input is accepted. Update `runtime.html` bridge cache key and the dedicated test's expected key to `?v=20260822-yue-e-g0-1`. Preserve logical UI/player/audio/health state and never fake hidden/suspend AudioContext. Updated tests lock native global identities, exact four-token bundle diff, scheduler ownership/suspend/resume/dispose, opaque sandbox, one-shot bundle-source correlation, bootstrap parsing, wrong source/origin/nonce rejection and the asymmetric target-origin rule.

Run the configured receipt-bound Node wrapper for `scripts/rewrite-soundscape-workshop-scheduler.mjs` with argument `--write` exactly once against the frozen pre-transform hash during this step; every later invocation uses `--check` and accepts only the fixed post-transform hash.

- [ ] **Step 6: Add the test-only main-player continuity probe.**

Under Development evidence flag, install the exact **read-only** request/response closure above; Task 9's evidence driver performs local-file UI loading separately. Baseline stays internal. Replies expose only specified booleans/counters, never `currentSrc`/Blob/media URL/account/source bytes. Normal mode has no transport. Pure JS tests cover nonce/origin/operation correlation, source non-disclosure and response schema.

- [ ] **Step 7: Run Web unit/static tests GREEN and update cache fingerprints.**

```powershell
. .\scripts\yue-e\invoke-yue-e-node-script.ps1
$YueEWebChecks = @(
  @{ Script='.\web\yue-e-host-bridge.js'; Args=@(); Syntax=$true },
  @{ Script='.\scripts\rewrite-soundscape-workshop-scheduler.mjs'; Args=@('--check'); Syntax=$false },
  @{ Script='.\scripts\check-yue-e-web-contract.mjs'; Args=@('--config','.yue-e-local.json'); Syntax=$false },
  @{ Script='.\scripts\check-yue-e-web-bridge.mjs'; Args=@('--config','.yue-e-local.json'); Syntax=$false },
  @{ Script='.\scripts\check-yue-e-player-continuity.mjs'; Args=@('--static','--config','.yue-e-local.json'); Syntax=$false },
  @{ Script='.\scripts\check-yue-e-reference-manifests.mjs'; Args=@('--root','.', '--config','.yue-e-local.json'); Syntax=$false },
  @{ Script='.\scripts\check-web-cache-fingerprints.mjs'; Args=@('--write'); Syntax=$false },
  @{ Script='.\scripts\check-web-cache-fingerprints.mjs'; Args=@(); Syntax=$false }
)
foreach ($YueEWebCheck in $YueEWebChecks) {
  $YueEResult = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
    -Config .\.yue-e-local.json -Mode Provisioned -Script $YueEWebCheck.Script `
    -ArgumentList $YueEWebCheck.Args -CheckSyntax:$YueEWebCheck.Syntax
  if ($YueEResult.ExitCode -ne 0) { throw "YueEWebCheckFailed:$($YueEWebCheck.Script):$($YueEResult.ExitCode)" }
}
```

Use the exact query key `?v=20260822-yue-e-g0-1` for every changed/new runtime CSS/JS reference. Re-run the reference checker, which must read the historical baseline commit and confirm protected semantic slices remain unchanged despite unrelated YueE hunks. Expected: all checks pass and no forbidden audio mutation is present.

Extend `check-web-cache-fingerprints.mjs` to treat `web/assets/soundscape-workshop/runtime.html` as an explicit nested HTML entry, parse its script/link URLs, and require/hash the versioned `bridge.js`; `.html` indirection may not hide it from the fingerprint graph. Add pass/stale-key/missing-child fixtures.

- [ ] **Step 8: Run existing browser/player regressions.**

```powershell
. .\scripts\yue-e\invoke-yue-e-node-script.ps1
$YueEConfig = Get-Content .\.yue-e-local.json | ConvertFrom-Json
$YueERegressionScripts = @(
  @{ Script='.\scripts\check-audio-playback-continuity.mjs'; Args=@('--edge-executable',$YueEConfig.edgeExecutable); Policy='PinnedEdge' },
  @{ Script='.\scripts\check-audio-analysis-lifecycle-contract.mjs'; Args=@(); Policy='None' },
  @{ Script='.\scripts\check-player-queue-pagination.mjs'; Args=@('--java-home',$YueEConfig.javaHome); Policy='PinnedJava' },
  @{ Script='.\scripts\check-app-exit-lifecycle.mjs'; Args=@(); Policy='None' },
  @{ Script='.\scripts\check-soundscape-workshop-runtime.mjs'; Args=@(); Policy='None' },
  @{ Script='.\scripts\check-sonic-topography-wallpaper-engine-preset.mjs'; Args=@('--edge-executable',$YueEConfig.edgeExecutable); Policy='PinnedEdge' }
)
foreach ($YueERegressionScript in $YueERegressionScripts) {
  $YueEResult = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
    -Config .\.yue-e-local.json -Mode Provisioned `
    -Script $YueERegressionScript.Script -ArgumentList $YueERegressionScript.Args `
    -DescendantPolicy $YueERegressionScript.Policy
  if ($YueEResult.ExitCode -ne 0) { throw "WebRegressionFailed:$($YueERegressionScript.Script):$($YueEResult.ExitCode)" }
}
```

Expected: all existing checks remain green. `check-player-queue-pagination.mjs` must accept the mandatory Gate `--java-home` value, resolve only its `java.exe`/`javac.exe`, and reject the historical Java 26 literals plus PATH/environment fallbacks. The two Edge regressions accept only mandatory `--edge-executable`; they remove fixed install-path discovery, and the sonic checker terminates only its exact tracked browser process tree through the wrapper's Job cleanup instead of spawning `taskkill.exe`.

- [ ] **Step 9: Commit only YueE Web hunks.**

```powershell
git add -- web/yue-e-host-bridge.js web/yue-e-host-bridge.css `
  scripts/check-yue-e-web-contract.mjs scripts/check-yue-e-web-bridge.mjs `
  scripts/check-yue-e-player-continuity.mjs scripts/check-web-cache-fingerprints.mjs `
  scripts/check-soundscape-workshop-runtime.mjs `
  scripts/check-audio-playback-continuity.mjs `
  scripts/check-sonic-topography-wallpaper-engine-preset.mjs `
  scripts/check-player-queue-pagination.mjs `
  scripts/rewrite-soundscape-workshop-scheduler.mjs `
  web/cache-fingerprints.json `
  web/assets/soundscape-workshop/assets/index-CSU_B_T9.js
git add -p -- web/index.html web/styles.css web/app.js web/soundscape-runtime.js
git add -p -- web/assets/soundscape-workshop/bridge.js `
  web/assets/soundscape-workshop/runtime.html
git diff --cached --check
git diff --cached
git commit -m "feat: add YueE embedded scene entry"
```

Do not stage a shared-file hunk unless it is required by this task.

## Task 9: Integrate `UnrealWorldHost` into WinForms

**Files:**

- Create: `native/windows/winforms/ApplicationPaths.cs`
- Create: `native/windows/winforms/yue-e/YueEWebMessageProtocol.cs`
- Create: `native/windows/winforms/yue-e/YueEWebBridge.cs`
- Create: `native/windows/winforms/yue-e/YueEEvidenceDriverServer.cs`
- Create: `native/windows/winforms/yue-e/YueEWindowJournal.cs`
- Create: `native/windows/winforms/yue-e/UnrealWorldHost.cs`
- Modify: `native/windows/winforms/Program.cs`
- Modify: `native/windows/winforms/FeMonsterForm.cs`
- Modify: `native/windows/winforms/FeMonsterClient.WinForms.csproj`
- Modify: `scripts/build-winforms-client.ps1`
- Modify: `src/main/java/com/femonster/api/ApiRoutes.java`
- Modify: `src/main/java/com/femonster/music/MusicApiConfigService.java`
- Modify: `native/windows/yue-e-harness/Program.cs`
- Create: `scripts/check-yue-e-host-integration.ps1`
- Create: `scripts/check-yue-e-package-runtime-readonly.ps1`

- [ ] **Step 1: Add RED host-orchestration suites.**

In this task, every “Host-controlled move/resize” means the controllable gesture **intent before any owner rectangle mutation**: pointer down is intercepted, owner stays frozen, matching suspend ack hides UE and yields a 250ms one-use permit, and only then may the native move loop start. Add permit timeout/replay/wrong-hit tests. Separately inject unprepared `WM_SYSCOMMAND`/`WM_WINDOWPOSCHANGING`/`WM_DPICHANGED` and require the synchronous pre-base hook to hide/latch UE before the first owner rect change; journal samples may never show visible UE with a mismatched owner rect.

Add compile-green stubs for `YueEWebBridge`, `YueEEvidenceDriverServer` and `UnrealWorldHost` with the exact injected constructor dependencies from **Production Interfaces**; the orchestration stub suite emits stable assertion token `HostOrchestrationNotImplemented`. Then test happy enter/exit, double enter, exit while starting, handshake timeout, three-safe-frame gate, bounds/epoch/size mismatch, one/two safe frames, bad present serial, child crash, pipe EOF, heartbeat timeout, one recovery, second failure/Faulted retry, WebView invalidation, close during active and focus restore. Add the full Host-controlled layout matrix: active resize/move/DPI → suspendReady → hidden/apply → three final safe frames → revealReady, including coalesced storms, restore cancellation and exit from Suspending/Suspended/Restoring. Add a separate OS-forced matrix driven only through the fake controller's injectable `SystemObservation`/snapshot API: owner minimize/Win+D/cloak/display-loss hides before notification and no suspend ack arrives, requiring immediate `Suspended(SystemForced)`, a current concealment epoch, stale receipt rejection and an armed hidden latch. Restore must keep that latch, issue a fresh suspend command, reject the old/best-effort ack, and only a matching fresh ack may transition through `Suspended(Acknowledged)` to final bounds/three safe Presents/reveal under opaque Web. Cover forced conceal during `Revealing`, forced restore with no ack (recovery/termination and never show), forced conceal during early enter and Covering, duplicate/out-of-order observations, and stale concealment epochs. Test graceful shutdown ack+self-exit and timeout. Add RED path fixtures for backend log/process tree, app recording, `StartupDiagnostics`, WebView2 UDF and the UE user/Saved/Logs/Config/Crashes/PSO cache: every resolver must stay beneath one injected stable state root while the release package remains read-only. Use fake `TimeProvider`, process, Job, pipe, window, runtime, evidence-driver, player-probe and Web dependencies.

```powershell
$YueEHostOrchestrationRed = powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\invoke-yue-e-dotnet-project.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Project .\native\windows\yue-e-harness\FeMonster.YueEHostHarness.csproj `
  -Operation Run -Configuration Release -AppMode Suite -Suite orchestration 2>&1 | Out-String
$YueEHostOrchestrationRedExit = $LASTEXITCODE
if ($YueEHostOrchestrationRedExit -eq 0) { throw 'ExpectedHostOrchestrationRed' }
if ($YueEHostOrchestrationRed -notmatch 'HostOrchestrationNotImplemented' -or
    $YueEHostOrchestrationRed -match '(?m)\b(CS|NU)\d{4}\b|ParameterBindingException|ParserError') {
  throw 'UnexpectedHostOrchestrationRed'
}
```

Expected: compile succeeds; orchestration assertions fail against stubs. Implement one transition/fault family at a time and make its focused suite GREEN before proceeding.

- [ ] **Step 2: Extract shared application paths without changing behavior.**

Move repository/install root, stable state-root and existing data-directory resolution from private `BackendHost` methods in `Program.cs` into `ApplicationPaths`. Keep existing backend/data/profile behavior byte-for-byte equivalent through harness assertions. YueE runtime root and sibling manifest resolution are fixed beneath the application root at `runtime/yue-e/` and `runtime/yue-e/yue-e-runtime-manifest.json`; `YueERuntimeManifest` alone resolves the protected `entryExecutableRelativePath` within that root. Production command-line executable overrides are forbidden. Tests inject a fake verified runtime descriptor through constructors, not user CLI.

Freeze `ApplicationPaths.ApplicationRoot` as read-only release content and distinguish two existing concepts: `StableStateRoot` is the one containment root for ordinary runtime writes (default `%LocalAppData%/FE Monster`), while `DataDirectory` preserves the existing `FE_MONSTER_DATA_DIR` business-data meaning (default `<stableStateRoot>/data`). A new internal/acceptance-only `FE_MONSTER_STATE_DIR` may set the state root explicitly; when both variables are supplied by Gate tooling, `DataDirectory` must be the reparse-free direct child `<stableStateRoot>/data`. For backward compatibility, production with only the existing data variable derives the historical state root from its parent and keeps the same WebView2/profile/log locations; no profile migration occurs in Gate 0.

Move only backend log and process-tree output from `<applicationRoot>/out/` to `<stableStateRoot>/runtime/backend/`; keep `StartupDiagnostics.LogPath` byte-compatible at `<stableStateRoot>/logs/startup.log` and WebView2 UDF byte-compatible at `<stableStateRoot>/WebView2/`; reserve each UE run at `<stableStateRoot>/runtime/yue-e/<runtimeBuildId>/<sessionId>/`. Put the bounded normal-build window-transition journal beneath `<stableStateRoot>/runtime/yue-e/window-journals/<32hex-launchId>/`; it is runtime state, never package content. The bundled JAR remains read-only at `<applicationRoot>/out/fe-monster-java.jar`. Change `/api/app/recording/save` only as needed to guarantee a reparse-checked `<dataDirectory>/recordings/fe-monster-*.(mp4|webm)` destination and return that path without changing the UI contract. Remove the startup deletion of `paths.root/dist/plugins/FE-Monster-Qishui-API-Plugin-2.0.0.zip`; migration may delete only data-directory copies and must treat release assets as immutable inputs. Every directory creation goes through `ApplicationPaths` containment/reparse validation; intentional updater/installer replacement is outside Gate 0 and is disabled during acceptance.

`scripts/check-yue-e-package-runtime-readonly.ps1` accepts `-Root -Config -PackageRoot -StageResult -Mode <Static|PackagedRuntime> -SelfTest`. Static mode rejects any ordinary runtime create/write/delete resolver outside `StableStateRoot` (except explicit installer/updater code unreachable in Gate mode), preserves the historical WebView2/diagnostics paths, and locks backend, UE user-data and recording destinations above. Packaged mode first validates the canonical package, copies it unchanged beneath a unique reparse-free `<evidenceRoot>/.readonly-runs/<32hex>/package/YueE-G0-<buildId>`, sets `FE_MONSTER_STATE_DIR=<32hex>/state` and `FE_MONSTER_DATA_DIR=<32hex>/state/data`, inventories the **entire** `<32hex>` launch root, then exercises startup, song import/play, scene enter/exit and app recorder. After clean close, the package clone must still match its manifest, every created/changed regular byte under the launch root must be below `state/`, and diagnostics/WebView2/UE Saved+Logs+Config+Crashes+PSO/backend plus `state/data/recordings` sentinels must all exist only at their typed destinations. Revalidate the canonical package, then delete only the resolved validated `<32hex>` launch root and require `.readonly-runs` empty. Add RED fixtures for state/data mismatch, reparse escape, each typed destination, a UE default-package/global-user `Saved` write, arbitrary launch-root sibling write and legacy cleanup attempting to touch package bytes.

- [ ] **Step 3: Implement strict WebView routing before legacy fallback.**

`YueEWebBridge.HandleMainMessageAsync` requires `ReferenceEquals(sender, current main CoreWebView2)`, navigation-ready identity and exact normalized scheme/host/port origin derived with `new Uri(options.Url)`. That configured URI is approvable only when scheme is `http` and host is a literal loopback address or exact `localhost`; an arbitrary `--url`, deceptive suffix or remote origin disables/rejects YueE even if it equals `options.Url`. Validate schema before dispatch. Any invalid `fe-yue-e-*` is consumed/rejected, never passed to legacy fallback. DesktopPet sender fails identity validation. Add local-loopback, remote-URL, `localhost.evil` and wrong-port tests.

On every main-controller creation **and reconstruction**, set `CoreWebView2.Settings.AreDevToolsEnabled=false`, `AreDefaultContextMenusEnabled=false` and `IsStatusBarEnabled=false` in both normal and internal-evidence builds. Evidence automation may use the programmatic `CallDevToolsProtocolMethodAsync` API through the typed adapter, but must not re-enable user DevTools UI or expose an arbitrary CDP endpoint. Harness tests read all three settings after initial startup, evidence startup and renderer reconstruction.

- [ ] **Step 4: Implement the host orchestration and transition handshake.**

The controllable gesture boundary is the title/resize pointer-down path, not a later `Move`/`Resize` callback. No `WM_NCLBUTTONDOWN` is sent until matching `suspendReady`, UE hide and permit issuance. If Windows initiates layout without a permit, the main HWND hook calls `ConcealBeforeUnpreparedOwnerMutation` synchronously before base/DefWindowProc and Host treats the observation as `SystemForced`; restore always needs the fresh-ack/hidden-latch path.

The accepted enter path verifies runtime, obtains the manifest-proven real target executable, computes validated off-monitor `YueEPrewarmPlacement` at final render size, creates session/pipe/Job, launches that executable suspended-then-jobbed directly into that placement, attaches only an HWND whose PID equals the exact `CreateProcessW`/pipe-peer PID and proves no monitor intersection. It waits for three safe prewarm Presents from one revision/epoch/size, requests opaque Web cover, then after matching ack moves UE to the real client rectangle, sends a new bounds revision and waits for **three more** safe Presents while Web remains opaque. Only then send `scene.reveal` for exactly `900ms` and await `revealReady`. Any PID split/bootstrap wrapper or pre-reveal error leaves Web usable; post-reveal error covers before hide/kill.

For Host-controlled move/resize/DPI changes while visible, Host never directly relocates or hides UE. It first enters `Suspending`, sends one `scene.suspend(300ms)` and coalesces further layout intents; only matching `suspendReady` permits a Host-initiated hide/relayout. Windows itself is a separate authority for forced owner concealment: owner minimize, Win+D/DWM cloak and display sleep/loss may hide an owned top-level HWND before WinForms receives an event. `IYueEWindowController` is the one production observation boundary: it combines owner/window WinEvents, `IsIconic`, `DWMWA_CLOAKED`, owned-HWND `WM_SHOWWINDOW`, display-power/topology notifications and a queryable snapshot, filters every event to the verified owner/owned HWND and exact PID, assigns a positive strictly increasing observation sequence, and raises `SystemObservation`; tests drive the identical boundary with a fake. Host serializes these observations with IPC, rejects duplicate/out-of-order observations, classifies `SystemForced`, keeps the already-opaque Web underlay, invalidates old reveal/bounds receipts, increments the concealment epoch and arms the controller's epoch-checked hidden latch.

An OS restore never directly reveals the previously clear/stale UE surface. If a matching current-epoch suspend ack did not already arrive, Host remains hidden and sends a fresh `scene.suspend(300ms)`; only its matching ack converts the state to `Acknowledged`. The fog animation duration and acknowledgement deadline are distinct: all layout/system-restore suspends keep `transitionMs:300`, while Host waits up to 1000ms total for the matching opaque/quiescent ack. Then Host applies the newest physical bounds/new swap-chain epoch, verifies Web opaque, releases the same-epoch hidden latch so the owned HWND is visible only below the insurance layer, and requires three consecutive final-size safe Presents before `scene.reveal(900ms)`. A stale epoch cannot release the latch; only the 1000ms deadline/pipe failure keeps it hidden and enters recovery/fault cleanup. Fake-clock tests accept an ack at 300ms and 999ms, reject one at/after 1000ms, and prove scheduling at the animation boundary cannot race timeout. Exit/fault cancels the transaction through the explicit state-table rows. Form handlers report layout intent only; controller observations report uncontrollable Windows actions; Host performs every controllable show/hide/move.

`YueEWindowJournal` is always present in normal and evidence builds but records only the minimum local window/transition facts required for diagnostics and faithful capture—never commands, media URLs, account data or paths. At app launch it creates a 32-hex `launchId`, current-user-only ACL directory, `descriptor.json` and append-only `events.ndjson`; the descriptor uses `yuee.window-journal-descriptor/v1` with `{launchId,hostPid,hostStartTimeUtc,hostExecutableSha256,applicationBuildId,qpcFrequency,eventsFile}`. Each NDJSON row uses `yuee.window-journal-event/v1`, the exact `YueEWindowJournalEntry` fields above, positive contiguous sequence/QPC, and lowercase-hex HWND values. Host writes+flushes only on attach, phase/visibility change, detach/generation end and close, with each row emitted inside the same transition gate after the state mutation it describes. Startup removes only validated launch directories older than the newest three and never the active launch. Harnesses prove contiguous order, crash-truncated-final-line rejection, PID/HWND/generation correlation, no secret/path fields, current-user ACL, 1 MiB hard cap/fail-closed rotation, and containment. The recorder may consume this journal, but it remains an untrusted hint until every HWND/PID/owner/process-tree fact is independently revalidated.

Normal exit sends `scene.prepareExit` and freezes UE input. UE raises fog opaque over `900ms`, then sends `exitReady`. Host hides UE onto the already-opaque Web cover, clears visual suspension and waits for Web clear ack; it then sends reliable `shutdown`, waits for `command.result(accepted)` and UE self-exit, and only then closes Job. One shared 3s deadline covers save/fog/Web/shutdown; timeout terminates Job. Fault/main-app emergency paths may force-close after restoring safe cover. Tests cover graceful ack/self-exit, shutdown timeout, no early hide/hard cut and `WebCoverWasOpaqueAtFault`.

- [ ] **Step 5: Wire form lifecycle and async close.**

Instantiate one host per `FeMonsterForm`. Keep main top-level `NavigationStarting/NavigationCompleted` handlers attached for the full controller lifetime—not only startup. Every start immediately fail-closes `navigationReady`, invalidates any active UE generation and disables entry. Only a successful completed navigation to approved loopback origin calls `BeginWebViewNavigation()`, binds a new generation/nonce and posts bootstrap state; failed/remote/stale completion stays disabled. Controller reconstruction follows the same path. On move/resize/DPI/fullscreen/visible/minimize/activation/display-change, report the newest `YueEMainWindowState` only; Host owns the suspend/restore transaction and focus. Renderer crash invalidates UE but does not claim same DOM/audio object. Main WebView stays on the same document during normal scene entry/exit.

Replace synchronous close with one explicit `Open → Coordinating → Finalizing → Closed` guard. On the first `OnFormClosing`, set `e.Cancel=true`, reject new YueE/Web commands and start one three-second deadline. Await `Host.ShutdownAsync` first, then use only the remaining deadline for the existing external-backend quit request; timeout force-closes the Host Job and records a stable diagnostic. Schedule exactly one UI-thread second `Close()`. On the final pass, do not cancel and execute each original responsibility exactly once in its existing order—desktop pet, desktop scene, background timer, tray resources, recording toolbar and (unless already attempted by the coordinator) external backend quit—then call through base/dispose. Reentrant OS/user close events only return the same coordinator task; they never double-dispose or start a second deadline. Harness tests cover Idle, Active, timeout, exception in each cleanup step and reentrant close while preserving the preexisting best-effort semantics.

- [ ] **Step 6: Embed the exact canonical runtime manifest in the host build.**

`build-winforms-client.ps1` also accepts `-RequireProvisionedDependencies`; Gate mode requires it, validates the receipt's dotnet/NuGet/global.json/project-lock/installed-pack identities, performs only contained offline locked restore and invokes configured DotNet through the child helper with publish `--no-restore`. The switch is mandatory whether or not internal evidence is enabled.

Add MSBuild property `YueERuntimeManifestPath` consumed as `EmbeddedResource`, plus matching build-script parameter. `scripts/build-winforms-client.ps1` keeps its existing Release publish and accepts `-Config`, `-YueERuntimeManifestPath` and switch `-YueEInternalEvidence`; it maps them to explicit MSBuild properties. The evidence switch is accepted only when a full canonical runtime manifest is supplied, the local config/baseline preflight passes and the output identifies `gateBuild:"G0"`; otherwise it fails closed. Staging supplies the exact canonical bytes from Task 7. At runtime compare sibling manifest bytes constant-time to the embedded bytes, then validate excluded-index files. Normal developer/production builds omit the switch, compile the driver/CDP fault surface out, and without runtime surface `YueERuntimeUnavailable` only on entry. The embedded manifest is immutable for one host build.

Add compile-time `YueEInternalEvidence` (default false). Only the Gate 0 acceptance host build sets it true; normal builds compile false and reject the runtime flag. For the staged candidate, Host accepts only `--yue-e-internal-evidence-root` whose resolved path is exactly the ignored `artifacts/yue-e/gates/G0/<current package buildId>` ancestor recorded by layout: current executable must be under its `package/YueE-G0-<same buildId>` child, while trace/bootstrap paths must be outside that package child; reject reparse traversal or build-ID mismatch. This allows repository evidence while Task 9's read-only policy keeps every mutable runtime byte outside the protected package. `PackagedInsights` appends only fixed trace args.

When enabled, `YueEEvidenceDriverServer` creates a current-Logon-SID-only randomized pipe `fe-monster.yuee.evidence.<32hex>` with independent 32-hex capability, 4-byte UTF-8 JSON ≤64KiB and exactly one client. Every request is an `additionalProperties:false` object `{protocol:"yuee.evidence",schemaVersion:1,capability,seq,requestId,command,payload}`; `seq` is a strictly increasing JS-safe positive integer and `requestId` is lowercase 32-hex. Every response is `{protocol,schemaVersion,seq,replyTo,status,result?,error?}` with `replyTo=requestId`, status `accepted|rejected`, sanitized stable errors and no paths. Commands are exactly `player.loadFixture|player.captureBaseline|player.sample|scene.enter|scene.exit|scene.injectFault|status`; fault payload is one of `process-kill|pipe-break|heartbeat-timeout|renderer-crash`. An Active `status` result includes only the accepted generation identifiers and fixed `loadedMapPackage`; it must equal `/Game/YueE/Gate0/L_YueE_Gate0`, derives solely from the verified UE hello and is null outside an accepted UE generation. Bootstrap lives at `<evidenceRoot>/host/evidence-driver.json` with current-user ACL; authenticate every request, close on seq replay/gap or capability failure, and keep a bounded 256 receipt ledger so same request replay cannot re-run a fault.

`player.loadFixture` accepts an empty payload and no path: Host derives the one fixed `<evidenceRoot>/audio/yue-e-continuity-30m.wav`, rejects reparse/non-WAV/outside-root, then the typed Web client uses WebView2 CDP `DOM.getDocument → DOM.querySelector(#localPlaylistInput) → DOM.setFileInputFiles` to trigger the real input `change`/`importLocalAudioFiles` path. It must then wait for the imported first `.shelf-song-button`, issue a trusted CDP/UIA click through that real shelf control, and only then await the existing `playPlaylistTracks → loadLocalSong` loaded/playing state; omitting the click is a RED test. `captureBaseline/sample` call typed `ProbePlayerAsync`; stale/duplicate/late/navigation-invalidated replies cancel/fail deterministically. Scene actions use the typed evidence control sink and the Host transition gate, never UE media IPC or fabricated Web identity. Delete capability/bootstrap and wipe the receipt ledger after run. Tests cover wrong path via tampered bootstrap/reparse/non-WAV, malformed/additional fields, seq replay/gap, duplicate request, wrong capability/oversize, all fault enums, probe correlation/cancellation and normal-mode absence.

- [ ] **Step 7: Run orchestration and fake-process integration GREEN.**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\invoke-yue-e-dotnet-project.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Project .\native\windows\yue-e-harness\FeMonster.YueEHostHarness.csproj `
  -Operation Run -Configuration Release -AppMode All
if ($LASTEXITCODE -ne 0) { throw "YueEHostHarnessAllFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-host-integration.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Mode FakeChild -Iterations 20 `
  -EvidenceRoot .\out\yue-e\host-fake
if ($LASTEXITCODE -ne 0) { throw "FakeHostIntegrationFailed:$LASTEXITCODE" }
```

Expected: all suites pass; there are zero fake child/grandchild survivors, stale messages or extra windows after 20 cycles.

`check-yue-e-host-integration.ps1` is created once with final parameters `-Root -Config -Mode <FakeChild|PackagedRuntime|PackagedInsights> -PackageRoot -Iterations -EvidenceRoot -SelfTest`; `PackagedInsights` requires the internal-evidence build, validates containment, launches the host with only `--yue-e-internal-evidence-root`, drives a real ≥60s active session and waits for trace close. `-SelfTest` validates parameter sets/containment and production-build rejection. Task 10 invokes existing modes without modifying the script.

- [ ] **Step 8: Build WinForms and run existing window regressions.**

```powershell
$YueEConfig = Get-Content .\.yue-e-local.json | ConvertFrom-Json
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\build-java.ps1 -Root (Get-Location).Path `
  -JavaHome $YueEConfig.javaHome -RequirePinnedJava
if ($LASTEXITCODE -ne 0) { throw "PinnedJavaBuildFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\build-winforms-client.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -RequireProvisionedDependencies
if ($LASTEXITCODE -ne 0) { throw "PinnedWinFormsBuildFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\invoke-yue-e-dotnet-project.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Project .\native\windows\startup-harness\FeMonster.StartupHarness.csproj `
  -Operation Run -Configuration Release -AppMode None
if ($LASTEXITCODE -ne 0) { throw "StartupHarnessFailed:$LASTEXITCODE" }
. .\scripts\yue-e\invoke-yue-e-node-script.ps1
foreach ($YueEWindowRegression in @(
  '.\scripts\check-desktop-scene-mapping.mjs',
  '.\scripts\check-window-rounding.mjs',
  '.\scripts\check-app-exit-lifecycle.mjs')) {
  $YueEResult = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
    -Config .\.yue-e-local.json -Mode Provisioned `
    -Script $YueEWindowRegression -ArgumentList @()
  if ($YueEResult.ExitCode -ne 0) { throw "WindowRegressionFailed:${YueEWindowRegression}:$($YueEResult.ExitCode)" }
}
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-windows-startup-window.ps1 -Runtime
if ($LASTEXITCODE -ne 0) { throw "StartupWindowRegressionFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-package-runtime-readonly.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json -Mode Static
if ($LASTEXITCODE -ne 0) { throw "StaticPackageReadonlyFailed:$LASTEXITCODE" }
```

Expected: host builds, existing app startup/rounding/DesktopScene behavior remains green, and missing YueE runtime does not break normal application launch.

- [ ] **Step 9: Commit only host integration hunks.**

```powershell
git add -- native/windows/winforms/ApplicationPaths.cs `
  native/windows/winforms/yue-e/UnrealWorldHost.cs `
  native/windows/winforms/yue-e/YueEWebMessageProtocol.cs `
  native/windows/winforms/yue-e/YueEWebBridge.cs `
  native/windows/winforms/yue-e/YueEEvidenceDriverServer.cs `
  native/windows/winforms/yue-e/YueEWindowJournal.cs `
  scripts/check-yue-e-host-integration.ps1 `
  scripts/check-yue-e-package-runtime-readonly.ps1
git add -p -- native/windows/winforms/Program.cs `
  native/windows/winforms/FeMonsterForm.cs `
  native/windows/winforms/FeMonsterClient.WinForms.csproj `
  native/windows/yue-e-harness/Program.cs `
  scripts/build-winforms-client.ps1 `
  src/main/java/com/femonster/api/ApiRoutes.java `
  src/main/java/com/femonster/music/MusicApiConfigService.java
if (git diff --cached --name-only | Select-String '/(bin|obj)/') { throw 'GeneratedDotnetOutputStaged' }
git diff --cached --check
git diff --cached
git commit -m "feat: integrate YueE Unreal world host"
```

## Task 10: Stage and Validate the Real `YueE-G0` Windows Acceptance Package

**Files:**

- Create: `scripts/yue-e/stage-yue-e-gate0.ps1`
- Create: `scripts/yue-e/collect-yue-e-gate0-evidence.ps1`
- Create: `scripts/check-yue-e-gate0.ps1`
- Create: `scripts/check-yue-e-audio-continuity.ps1`
- Create: `scripts/check-yue-e-transition-video.mjs`
- Create: `scripts/analyze-yue-e-insights.ps1`
- Create: `scripts/fixtures/yue-e-transition/pass-1920x1080-60.mp4`
- Modify: `scripts/check-yue-e-player-continuity.mjs`
- Modify: `scripts/check-native-spatial-jni.mjs`
- Modify: `scripts/check-native-spatial-http-stream.mjs`
- Modify: `scripts/check-native-spatial-browser-block.mjs`
- Create: `native/windows/yue-e-audio-probe/FeMonster.YueEAudioProbe.csproj`
- Create: `native/windows/yue-e-audio-probe/packages.lock.json`
- Create: `native/windows/yue-e-audio-probe/Program.cs`
- Create: `native/windows/yue-e-window-pair-recorder/FeMonster.YueEWindowPairRecorder.vcxproj`
- Create: `native/windows/yue-e-window-pair-recorder/Program.cpp`
- Create: `native/windows/yue-e-window-pair-recorder/WindowPairCapture.h`
- Create: `native/windows/yue-e-window-pair-recorder/WindowPairCapture.cpp`
- Create: `scripts/check-yue-e-window-pair-recorder.ps1`
- Create: `scripts/yue-e/run-yue-e-gate0-recording.ps1`
- Create: `docs/superpowers/gates/yue-e-g0.json`
- Generate: `out/yue-e/gate0-stage-result.json`
- Generate: `artifacts/yue-e/gates/G0/<buildId>/*`

Freeze the final acceptance interfaces before tests: collector `-Root -Config -StageResult -SelfTest`; audio checker `-Root -Config -StageResult -Iterations -EvidenceRoot -SelfTest`; transition analyzer `--config --input --report --self-test`; Insights analyzer `-Root -Config -StageResult -Trace -Output -SelfTest`; player checker `--config (--static|--runtime) --iterations --stage-result --self-test`; recording runner `-Root -Config -StageResult -EvidenceRoot -SelfTest`. The pair-recorder checker has exact disjoint parameter sets: SelfTest = `-Root -Config -OutputRoot -SelfTest`; Start = `-Mode Start -Root -Config -StageResult -CloneRoot -StableStateRoot -ExpectedHostPid -LaunchId -OutputPath -ReceiptPath -ControlState`; Stop = `-Mode Stop -Root -Config -ControlState`. PowerShell self-tests must also verify parameter-set parsing and reject uncontained paths.

For the transition analyzer, both SelfTest and production parameter sets also require `--edge-executable <configured absolute path>` and run with `PinnedEdge`; syntax-only checking launches no descendant and uses `None`.

- [ ] **Step 1: Write the final RED aggregate checker.**

`check-yue-e-gate0.ps1` accepts `-Root -Config -StageResult -CandidateRecordFromIndex -RequireHeadTrackedRecord -SelfTest` and fails unless all automated logs are green, package/manifest bytes match, real runtime recorded three accepted native Presents before reveal, matrices are complete, evidence is readable and Gate record is `in_review` with matching protected hashes. Any required evidence status `blocked`, `skipped`, `warning-as-pass` or `N/A` without an allowed Gate 0 reason fails. `CaptureSurfaceMismatch` is allowed only as a calibration diagnostic when the same run has a complete GREEN `recordingMode:"wgc-window-pair"` receipt, verified source bindings and a passing final video; `CaptureSurfaceUnavailable`, a missing recorder receipt or an unapproved recording mode always fails.

The aggregate re-runs `check-yue-e-ue-automation-report.ps1` in Green mode and requires the exact frozen manifest/report hashes and eleven discovered D3D12 successes bound by the runtime and stage receipts; its self-test fixtures assert count 11 and include `PawnNavigation`. UE command exit code alone never satisfies Gate 0.

Before production implementation, write deterministic anonymous self-test fixtures for seven tools and confirm each RED against a minimal stub: `collect-yue-e-gate0-evidence.ps1`, `check-yue-e-audio-continuity.ps1`, `check-yue-e-transition-video.mjs`, `analyze-yue-e-insights.ps1`, runtime mode of `check-yue-e-player-continuity.mjs`, `check-yue-e-window-pair-recorder.ps1`, and `run-yue-e-gate0-recording.ps1`. Counter/CSV fixtures contain synthetic paths/clocks/Presents/window/audio/timing data only—no account/network data. The transition tool additionally uses the tracked short LFS fixture `scripts/fixtures/yue-e-transition/pass-1920x1080-60.mp4`: `--self-test` must launch the configured installed Edge and run the **same video+canvas decode path** as production, first passing its decoded frames/PTS, then deterministically transforming those decoded frames/metadata to make black-frame, one-frame-pop, 8×8-blocking, PTS-gap and wrong-size/track-metadata cases each fail with the expected code. It may not replace real decoding with precomputed counters. The recorder self-test builds with the configured VS17/SDK while overriding `OutDir` and `IntDir` to contained ignored `out/yue-e/window-pair-recorder/` paths and proving no generated byte appears beside tracked source. It opens deterministic local test HWNDs with independently animated patterns, captures through the production WGC path, verifies exact owner/z-order/physical-rectangle composition and QPC timestamps, and runs the full journal sequence `HostReady(no UE) → generation 1 attach/visible → expected detach/Idle → generation 2 attach/visible → unexpected kill/detach → Web-only recovery gap → generation 3 attach/visible → stop`, proving one continuous valid MP4 and three correctly bound generations. It separately proves skipped/duplicate journal sequence, wrong launch/Host PID/owner, stale generation, unexpected black source, missing main frame, color mismatch, orphan recorder and out-of-root output each fail. The runner self-test proves calibration-pass chooses the app branch, `CaptureSurfaceMismatch` chooses Start/Stop exactly once, failed Start never drives the scenario, every exception still stops/kills the exact recorder and clone, and the dynamic crash/recovery fixture produces one final receipt. Each tool regenerates fixtures in a validated temp directory, checks pass and deliberate-fail cases, and cleans only that temp root.

```powershell
$YueEGateAggregateRed = powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-gate0.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -StageResult .\out\yue-e\gate0-stage-result.json 2>&1 | Out-String
$YueEGateAggregateRedExit = $LASTEXITCODE
if ($YueEGateAggregateRedExit -eq 0) { throw 'ExpectedGateAggregateRed' }
if ($YueEGateAggregateRed -notmatch 'GatePackageMissing' -or
    $YueEGateAggregateRed -match 'ParameterBindingException|ParserError') {
  throw 'UnexpectedGateAggregateRed'
}
```

Expected: non-zero with `GatePackageMissing`.

- [ ] **Step 2: Implement deterministic portable staging.**

`stage-yue-e-gate0.ps1` accepts `-Root -Config -WebView2Mode -ResultPath -SelfTest` and must:

1. require a clean tracked worktree at current full `HEAD` (the eventual Step 3 candidate commit) by invoking the configured Git only through `Invoke-YueEGateChildProcess -Kind Git -GitPolicy WorkingTreeCompare` for `status --porcelain` and non-cached `diff --quiet`, then run toolchain/reference/IPC/Web/host/UE checks;
2. build `runtime/yue-e` and its canonical manifest;
3. create `$ValidatedStagingRoot` as one unique validated root beneath `artifacts/yue-e/gates/G0/.staging`; resolve and clear only the generated `$Root\out\installer\work` directory after proving it is beneath `$Root\out\installer`, then validate `.tools/yue-e/provision-receipt.json`: its `baselineCommit` must equal `.yue-e-local.json.baselineCommit`, its toolchain-lock hash must equal the current unchanged lock bytes, and every source/package/vendor identity must still match. Do **not** compare receipt `baselineCommit` to the later candidate `HEAD`. Run one canonical **full** `build-installer.ps1 -BuildConfig $Config -RequireProvisionedDependencies -OutputDir (Join-Path $ValidatedStagingRoot 'installer-artifacts') -StageOnly -WebView2Mode Online` invocation without `-SkipBuild`. This invocation must execute the existing Build-App chain for all four plugins, pinned Java JAR, required VS17/Cargo XAudio2/upmix native outputs, Web payload and ordinary WinForms host using only explicit provisioned dependencies. Capture its start/end, clean candidate source commit, provision-receipt hash/identities, actual `compiler:"VisualStudio2022"`/VS17 product+MSVC versions/`installRootMatchesConfig:true`, and hashes of every expected non-WinForms output in `full-app-build-receipt.json`; a missing/freshness/hash entry is `StaleAppArtifact`;
4. after that full build, set `$CanonicalRuntimeManifest` to Task 7's validated manifest and rebuild the WinForms publish **last** with `build-winforms-client.ps1 -Root $Root -Config $Config -YueERuntimeManifestPath $CanonicalRuntimeManifest -YueEInternalEvidence -RequireProvisionedDependencies`; verify the publish embeds matching manifest bytes, reports `internalEvidence:true`, and the stage/full-build receipt revalidates this final publish's contained dotnet/NuGet/global.json/project-lock/installed-pack identities;
5. run exactly `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-installer.ps1 -BuildConfig $Config -RequireProvisionedDependencies -OutputDir (Join-Path $ValidatedStagingRoot 'installer-artifacts') -StageOnly -SkipBuild -WebView2Mode Online`; this second StageOnly pass must preserve the final pinned/evidence host while using only the fresh ordinary outputs recorded in Step 3;
6. resolve the existing script's actual fixed payload path as `$YueEStageOnlyPayload = [IO.Path]::GetFullPath((Join-Path $Root 'out/installer/work/payload/FE Monster'))`, require it beneath `$Root\out\installer\work\payload`, validate its existing `payload-integrity.json`, then copy it into that unique staging root;
7. add `runtime/yue-e` beneath the copied application root and add a small `Run-YueE-G0.cmd` that launches the nested existing FE Monster executable without altering arguments;
8. regenerate the copied payload's existing `payload-integrity.json` with the repository's current schema and run `check-payload-integrity-tamper.ps1` against a contained temporary copy;
9. enumerate the complete staged Gate package **in memory**, excluding only the future `gate-package-manifest.json`. Normalize relative paths to `/`, reject duplicates/reparse points, sort ordinally and JCS-canonicalize entries `{path,size,sha256}`; compute `protectedFileIndexSha256` without writing a provisional index file;
10. derive `buildId = g0-<12-char-Step-3-commit>-<12-char-protectedFileIndexSha256>`, move the still-manifest-free package once to `artifacts/yue-e/gates/G0/<buildId>/package/YueE-G0-<buildId>`, then write `gate-package-manifest.json` **once** with schema, build ID, source commit, runtime build ID, full canonical file index and index hash;
11. re-enumerate the final package with the identical single exclusion and require byte-for-byte equal canonical index/hash; record the final manifest SHA-256, and verify every copy/move/remove target stays beneath its validated generated root before mutation.

Finally write `out/yue-e/gate0-stage-result.json` atomically with `buildId`, source commit, package root, evidence root, runtime build ID and manifest hashes. Every later command reads this file; no human replaces `<buildId>` placeholders.

Do not modify the production installer payload rules in Gate 0 and do not commit the multi-gigabyte package.

- [ ] **Step 3: Implement each acceptance tool, make its self-test GREEN, then commit.**

First create the audio-probe `net8.0-windows` project with `RestorePackagesWithLockFile=true`, zero `PackageReference` and reviewed empty applicable `packages.lock.json`. Validate XML/JSON without invoking DotNet, make a narrow scaffold commit, then rerun provision and verify the receipt's `projectLockSetSha256`; this must happen before the first audio-probe build:

```powershell
git add -- native/windows/yue-e-audio-probe/FeMonster.YueEAudioProbe.csproj `
  native/windows/yue-e-audio-probe/packages.lock.json
git diff --cached --check
git commit -m "build: lock YueE audio probe dependencies"
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\provision-build-dependencies.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Receipt .\.tools\yue-e\provision-receipt.json
if ($LASTEXITCODE -ne 0) { throw "AudioProbeReprovisionFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\provision-build-dependencies.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json -SelfTest
if ($LASTEXITCODE -ne 0) { throw "ExpandedAudioProbeClosureSelfTestFailed:$LASTEXITCODE" }
```

Implement the seven RED tools one at a time and run each deterministic pass/fail self-test to GREEN before starting the next; then implement staging and aggregate checks and run their self-tests. Commit only after all syntax/self-tests pass so the candidate build ID names a complete source revision:

```powershell
. .\scripts\yue-e\invoke-yue-e-node-script.ps1
$YueEConfig = Get-Content .\.yue-e-local.json | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$YueEConfig.edgeExecutable)) { throw 'EdgeExecutableMissing' }
$YueETransitionSyntax = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
  -Config .\.yue-e-local.json -Mode Provisioned `
  -Script .\scripts\check-yue-e-transition-video.mjs -ArgumentList @() -CheckSyntax
if ($YueETransitionSyntax.ExitCode -ne 0) { throw "TransitionSyntaxFailed:$($YueETransitionSyntax.ExitCode)" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\invoke-yue-e-dotnet-project.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Project .\native\windows\yue-e-audio-probe\FeMonster.YueEAudioProbe.csproj `
  -Operation Build -Configuration Release -AppMode None
if ($LASTEXITCODE -ne 0) { throw "AudioProbeBuildFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\invoke-yue-e-dotnet-project.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Project .\native\windows\yue-e-audio-probe\FeMonster.YueEAudioProbe.csproj `
  -Operation Run -Configuration Release -AppMode SelfTest
if ($LASTEXITCODE -ne 0) { throw "AudioProbeSelfTestFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-window-pair-recorder.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -OutputRoot .\out\yue-e\window-pair-recorder-self-test -SelfTest
if ($LASTEXITCODE -ne 0) { throw "WindowPairRecorderSelfTestFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\run-yue-e-gate0-recording.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -StageResult .\out\yue-e\gate0-stage-result.json `
  -EvidenceRoot .\out\yue-e\recording-runner-self-test -SelfTest
if ($LASTEXITCODE -ne 0) { throw "RecordingRunnerSelfTestFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\collect-yue-e-gate0-evidence.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json -SelfTest
if ($LASTEXITCODE -ne 0) { throw "EvidenceCollectorSelfTestFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-audio-continuity.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json -SelfTest
if ($LASTEXITCODE -ne 0) { throw "AudioContinuitySelfTestFailed:$LASTEXITCODE" }
$YueETransitionSelfTest = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
  -Config .\.yue-e-local.json -Mode Provisioned `
  -Script .\scripts\check-yue-e-transition-video.mjs `
  -ArgumentList @('--self-test','--config','.yue-e-local.json','--edge-executable',$YueEConfig.edgeExecutable) `
  -DescendantPolicy PinnedEdge
if ($YueETransitionSelfTest.ExitCode -ne 0) { throw "TransitionSelfTestFailed:$($YueETransitionSelfTest.ExitCode)" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\analyze-yue-e-insights.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json -SelfTest
if ($LASTEXITCODE -ne 0) { throw "InsightsAnalyzerSelfTestFailed:$LASTEXITCODE" }
$YueEPlayerSelfTest = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
  -Config .\.yue-e-local.json -Mode Provisioned `
  -Script .\scripts\check-yue-e-player-continuity.mjs `
  -ArgumentList @('--runtime','--self-test','--config','.yue-e-local.json')
if ($YueEPlayerSelfTest.ExitCode -ne 0) { throw "PlayerContinuitySelfTestFailed:$($YueEPlayerSelfTest.ExitCode)" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\stage-yue-e-gate0.ps1 `
  -SelfTest -Root (Get-Location).Path -Config .\.yue-e-local.json
if ($LASTEXITCODE -ne 0) { throw "GateStageSelfTestFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-gate0.ps1 `
  -SelfTest -Root (Get-Location).Path -Config .\.yue-e-local.json
if ($LASTEXITCODE -ne 0) { throw "GateAggregateSelfTestFailed:$LASTEXITCODE" }
git add -- scripts/yue-e/stage-yue-e-gate0.ps1 `
  scripts/yue-e/collect-yue-e-gate0-evidence.ps1 `
  scripts/check-yue-e-gate0.ps1 `
  scripts/check-yue-e-audio-continuity.ps1 `
  scripts/check-yue-e-transition-video.mjs `
  scripts/analyze-yue-e-insights.ps1 `
  scripts/check-yue-e-player-continuity.mjs `
  scripts/check-native-spatial-jni.mjs `
  scripts/check-native-spatial-http-stream.mjs `
  scripts/check-native-spatial-browser-block.mjs `
  scripts/check-yue-e-window-pair-recorder.ps1 `
  scripts/yue-e/run-yue-e-gate0-recording.ps1 `
  scripts/fixtures/yue-e-transition/pass-1920x1080-60.mp4 `
  native/windows/yue-e-audio-probe `
  native/windows/yue-e-window-pair-recorder
if (git diff --cached --name-only | Select-String '/(bin|obj)/') { throw 'GeneratedDotnetOutputStaged' }
git lfs status
git diff --cached --check
git commit -m "test: add YueE Gate 0 acceptance automation"
```

- [ ] **Step 4: Stage the package and verify byte integrity.**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\stage-yue-e-gate0.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -WebView2Mode Online -ResultPath .\out\yue-e\gate0-stage-result.json
if ($LASTEXITCODE -ne 0) { throw "GateStageFailed:$LASTEXITCODE" }
```

Expected: the JSON result names exactly one `YueE-G0-<buildId>` package; relaunch succeeds without source trees. For tamper proof, copy the package to a uniquely created temp directory beneath `artifacts/yue-e/gates/G0/.staging`, resolve/verify both paths remain beneath that directory, mutate one explicit runtime file in the copy, require `RuntimeIntegrityFailed` while Web/song remain usable, then delete only that validated temp copy and reverify the untouched original package GREEN.

Then prove an ordinary real launch cannot mutate the canonical package:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-package-runtime-readonly.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -PackageRoot ((Get-Content .\out\yue-e\gate0-stage-result.json | ConvertFrom-Json).packageRoot) `
  -StageResult .\out\yue-e\gate0-stage-result.json -Mode PackagedRuntime
if ($LASTEXITCODE -ne 0) { throw "PackagedReadonlyFailed:$LASTEXITCODE" }
```

Expected: package before/after canonical indexes are identical; backend log/process tree, recorder output and all other ordinary runtime writes appear only in the fresh stable state root, with business data below its `data/` child. This check is rerun after every later real matrix that launches the canonical package.

- [ ] **Step 5: Re-run the existing native-audio regression suite.**

```powershell
$YueERoot = (Get-Location).Path
$YueEConfig = Get-Content .\.yue-e-local.json | ConvertFrom-Json
$YueEDeps = Get-Content .\.tools\yue-e\provision-receipt.json | ConvertFrom-Json
$YueEReceipt = Join-Path $YueERoot '.tools\yue-e\provision-receipt.json'
$YueEObrRoot = [IO.Path]::GetFullPath((Join-Path $YueERoot $YueEDeps.sources.googleObr.sourceRoot))
$YueECargoHome = [IO.Path]::GetFullPath((Join-Path $YueERoot $YueEDeps.packages.cargo.home))
$YueECargoVendor = [IO.Path]::GetFullPath((Join-Path $YueERoot $YueEDeps.packages.cargo.vendorRoot))
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\build-java.ps1 -Root $YueERoot `
  -JavaHome $YueEConfig.javaHome -RequirePinnedJava
if ($LASTEXITCODE -ne 0) { throw "PinnedJavaBuildFailed:$LASTEXITCODE" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\build-xaudio2.ps1 -Root $YueERoot `
  -VisualStudioInstallRoot $YueEConfig.visualStudioInstallRoot `
  -CargoExecutable $YueEConfig.cargoExecutable `
  -RustcExecutable $YueEConfig.rustcExecutable `
  -ObrSourceDir $YueEObrRoot -JavaHome $YueEConfig.javaHome `
  -CargoHome $YueECargoHome -CargoVendorRoot $YueECargoVendor `
  -ProvisionReceipt $YueEReceipt `
  -RequireProvisionedDependencies
if ($LASTEXITCODE -ne 0) { throw "PinnedXAudio2BuildFailed:$LASTEXITCODE" }
$YueENativeChecks = @(
  @{ Script='scripts/check-native-spatial-audio-pipeline.mjs'; Args=@(); Policy='None' },
  @{ Script='scripts/check-native-spatial-timeline-epoch.mjs'; Args=@(); Policy='None' },
  @{ Script='scripts/check-native-spatial-seek-continuity.mjs'; Args=@(); Policy='None' },
  @{ Script='scripts/check-native-audio-chain-mode-contract.mjs'; Args=@(); Policy='None' },
  @{ Script='scripts/check-native-spatial-jni.mjs'; Args=@('--java-home',$YueEConfig.javaHome); Policy='PinnedJava' },
  @{ Script='scripts/check-native-spatial-http-stream.mjs'; Args=@('--java-home',$YueEConfig.javaHome); Policy='PinnedJava' },
  @{ Script='scripts/check-native-spatial-browser-block.mjs'; Args=@('--java-home',$YueEConfig.javaHome,'--edge-executable',$YueEConfig.edgeExecutable); Policy='PinnedJavaAndEdge' }
)
. (Join-Path $YueERoot 'scripts/yue-e/invoke-yue-e-node-script.ps1')
foreach ($YueENativeCheck in $YueENativeChecks) {
  $YueECheckResult = Invoke-YueEGateNodeScript -Root $YueERoot `
    -Config .\.yue-e-local.json -Mode Provisioned `
    -Script (Join-Path $YueERoot $YueENativeCheck.Script) `
    -ArgumentList $YueENativeCheck.Args -DescendantPolicy $YueENativeCheck.Policy
  if ($YueECheckResult.ExitCode -ne 0) {
    throw "NativeAudioRegressionFailed:$($YueENativeCheck.Script):$($YueECheckResult.ExitCode)"
  }
}
```

Expected: the unchanged BrowserDry/native audio baseline remains green before any YueE continuity claim. The three Java-spawning scripts accept mandatory Gate `--java-home`; the browser script also accepts mandatory `--edge-executable`. They resolve only those absolute validated executables and contain no Java 26 literal, environment/PATH fallback or undeclared spawn. Gate 0 must not modify Java/JNI/C++ pose APIs to make these pass.

- [ ] **Step 6: Run the real packaged DX12 20-cycle and fault matrix.**

Use an isolated test data root and the packaged host/runtime, never Editor or fake child:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-host-integration.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Mode PackagedRuntime `
  -PackageRoot ((Get-Content .\out\yue-e\gate0-stage-result.json | ConvertFrom-Json).packageRoot) `
  -Iterations 20 `
  -EvidenceRoot ((Get-Content .\out\yue-e\gate0-stage-result.json | ConvertFrom-Json).evidenceRoot)
if ($LASTEXITCODE -ne 0) { throw "PackagedHostMatrixFailed:$LASTEXITCODE" }
```

The matrix includes normal enter/exit, rapid double enter, exit during warmup, **exit during Revealing with fog reversal**, UE process kill, pipe break, 2s heartbeat timeout, one automatic restart, second failure staying `Faulted` on Web, explicit retry, main-window close, WebView2 renderer recovery and host exit. For every accepted initial/recovery generation it queries typed evidence `status` and requires the handshake-bound `loadedMapPackage` to equal `/Game/YueE/Gate0/L_YueE_Gate0`; the integration receipt binds those values plus the exact eleven-test report/manifest hashes, so a cooked-but-never-loaded map fails. Assert no child/grandchild, HWND, pipe, Job, timer or stale session/generation remains. Before each forced kill assert the underlay cover is already opaque; the first compositor frame after UE disappears must therefore be fog, and host recovery state must post within 250ms. Five seconds after each Idle, record Host private bytes, working set, process handle count, USER and GDI objects; discard cycles 1–3. On cycles 4–20, ordinary-least-squares private-byte slope must be ≤2 MiB/cycle, mean of cycles 16–20 may exceed cycles 4–8 by at most 64 MiB, process-handle slope must be ≤0.5/cycle and its last-five mean may exceed first-five by at most 16; USER/GDI last-first delta must each be ≤2. UE PID/Job/pipe/window counts must be exactly zero at every Idle. Store raw samples and formulas so aggregate recomputes them.

- [ ] **Step 7: Run the real window/DPI/focus matrix.**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-window-contract.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Mode PackagedRuntime `
  -PackageRoot ((Get-Content .\out\yue-e\gate0-stage-result.json | ConvertFrom-Json).packageRoot) `
  -DpiCsv '100,125,150,200' `
  -EvidenceRoot ((Get-Content .\out\yue-e\gate0-stage-result.json | ConvertFrom-Json).evidenceRoot)
if ($LASTEXITCODE -ne 0) { throw "PackagedWindowMatrixFailed:$LASTEXITCODE" }
```

Before launching, repeat the real CCD probe and bind the two distinct-DPI target IDs from `toolchain-preflight.json`; topology/DPI drift aborts with `MixedDpiMonitorPairMissing`. Cover move, all resize edges/corners, maximize/restore, application fullscreen, minimize/restore, Alt-Tab, Win+D, focus return, at least one real drag of the running main/owned-window pair from the first bound target to the second and back, display sleep/resume and display hot-plug when supported. Include a rapid resize storm while `Restoring`, require cancellation of the old reveal receipt, latest physical bounds only, three new safe Presents and rejection of late `revealReady`; every suspend/restore transition must show opaque fog without black/stale frames. Require UE HWND exact PID, non-child/owned/toolwindow, interior keyboard/mouse input, no global TopMost/taskbar button/blur/black border/distortion. Synthetic DPI tests validate arithmetic only. If the bound real mixed-DPI pair or transfer evidence is unavailable, record `blocked` with `MixedDpiMonitorPairMissing` and fail Gate 0; do not label it passed.

- [ ] **Step 8: Run true main-player continuity and loopback checks.**

Generate a deterministic 30-minute 48kHz/16-bit mono seeded multitone/chirp WAV and load it through the normal evidence-only loopback fixture flow; it outlasts the matrix. Disable auxiliary app audio only for measurement. Build a zero-NuGet Core Audio helper that prefers Windows process-loopback with `PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE` for the packaged FE Monster tree. If process-loopback is unavailable, use default-endpoint loopback only while every non-target active session peak stays below -60dBFS for the entire capture; otherwise `AudioCaptureContaminated` fails Gate. Initialize from `IAudioClient.GetMixFormat()` (never assume 48k/float), record sample format/channel mask/discontinuity flags, deterministically downmix by channel mask and band-limited resample to 48k mono float before analysis. Self-tests cover 44.1→48k, stereo/5.1, discontinuity and contaminated endpoint.

```powershell
. .\scripts\yue-e\invoke-yue-e-node-script.ps1
$YueEPlayerRuntime = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
  -Config .\.yue-e-local.json -Mode Provisioned `
  -Script .\scripts\check-yue-e-player-continuity.mjs `
  -ArgumentList @('--runtime','--iterations','20','--config','.yue-e-local.json',
    '--stage-result','.\out\yue-e\gate0-stage-result.json') `
  -DescendantPolicy PinnedPackagedHost
if ($YueEPlayerRuntime.ExitCode -ne 0) { throw "PlayerContinuityRuntimeFailed:$($YueEPlayerRuntime.ExitCode)" }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-audio-continuity.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -StageResult .\out\yue-e\gate0-stage-result.json `
  -Iterations 20 `
  -EvidenceRoot ((Get-Content .\out\yue-e\gate0-stage-result.json | ConvertFrom-Json).evidenceRoot)
if ($LASTEXITCODE -ne 0) { throw "AudioContinuityFailed:$LASTEXITCODE" }
```

Assert across starting/warming/active/exit/kill/recovery:

- normal UE faults preserve internally measured `sameElement`, `sameSource`, `sameQueueRevision`; probe output never contains `currentSrc`/Blob/media URL;
- over every normal UE enter/exit/fault window, `abs((mediaDelta / playbackRate) - qpcWallDelta) ≤ 150ms`, no media delta is below `-20ms`, and YueE never resets/seeks;
- MediaElementSource is still created once, AudioContext/PCM analysis is not suspended and player/native-audio health polling continues;
- no bridge-caused duplicate `play()`, `pause()`, `load()`, `src` or `currentTime` mutation occurs;
- UE/package inspection finds no main-song media asset, Web Browser song audio instance, Audio Component or native song session;
- pre-entry authoritative chain mode may be `BrowserDry` or `NativeSpatial`; it and the count of main-song audio sessions remain unchanged. Against a 10s pre-entry calibration, 20ms-window loopback RMS gain may not shift by >1.5dB for ≥100ms; no expected-active interval may remain below -60dBFS for >100ms; STFT (2048 Hann, 50% overlap, 100Hz–12kHz) median response deviation must stay ≤1.5dB with no notch deeper than 6dB for three adjacent frames; cross-correlation must show no secondary 1–50ms peak above -18dB of main for ≥250ms. These freeze “no duplicate/comb/silence” numerically;
- WebView2 renderer crash is a separate failure class: do not require same DOM object or seamless audio. Require old Web/UE generations invalidated, zero orphan UE resources, and recovery follows the existing player/WebView semantics without YueE inventing a second source.

- [ ] **Step 9: Record real clarity, smooth-transition and performance evidence.**

An app-recorder calibration is `pass` only if all of these are true in the same clip: verified FE Monster application-window source, WebView plus owned UE visible through enter/active/exit, genuine MP4 container/MIME (not WebM renamed), decodable H.264 track at exactly 1920×1080 with 60fps metadata, every PTS gap ≤25ms, and the short calibration mode of the production transition analyzer passes. Any surface, codec, container, resolution, frame-rate, PTS or decode mismatch records its typed diagnostic and automatically selects WGC window-pair fallback before the final scenario. It never attempts to transcode or rename. Runner self-tests include a surface-complete WebM fixture and a surface-complete VFR/PTS-gap fixture; both must select WGC exactly once.

Use the fixed reference class from the spec: Windows 11, 1920×1080 60Hz, 16GB RAM, Intel i5-12400 / Ryzen 5 5600 class CPU, RTX 3060 / RX 6600 6GB or higher; record exact GPU, driver version, electric power mode and actual display refresh. Use native 100% render scale with dynamic resolution off.

The existing app recorder (`getDisplayMedia` + `MediaRecorder`) is the preferred path only after a calibration clip proves the user-selected **FE Monster application window** capture contains both the WebView surface and the verified owned UE top-level surface through enter/active/exit. Never select the whole monitor. If the owned UE surface is absent/black, record the calibration result `CaptureSurfaceMismatch` and automatically use the already-scoped `FeMonster.YueEWindowPairRecorder`; no later approval or unplanned tool is required. If both paths fail, finish the run as failed with `CaptureSurfaceUnavailable`—never substitute a monitor capture, static frame or fabricated surface.

`run-yue-e-gate0-recording.ps1` is the one named recording orchestrator. It validates the stage result/package, creates the isolated clone/state roots below, launches the clone in normal mode, binds `ExpectedHostPid` to the exact executable under that clone plus process start time, obtains the one main HWND by exact PID, and waits for a journal descriptor whose `hostPid`, executable hash/build ID and 32-hex `launchId` match. It drives the fixed song import, shelf click, adjacent Scene button, movement, exit/re-entry and fault/recovery beats through real UI Automation/`SendInput` against the foreground verified HWNDs; it never uses the internal evidence pipe or arbitrary CDP. For the crash beat it reads the current journal generation, independently revalidates its UE PID as a live descendant/Job member with the exact owned HWND, and terminates only that PID. Calibration selects the app-recorder branch when complete; otherwise the runner invokes the pair-recorder Start parameter set before the final scenario and the Stop set in `finally`. It writes `recording-run.json` binding clone hash, Host PID/start, main HWND hash, launch ID, chosen mode, control-state hash, interaction timestamps, every killed/recovered generation and final output/receipt hashes. Any ambiguous PID/HWND/journal, UI step timeout, orphan process or cleanup failure fails the run.

The native executable CLI is fixed to `--main-pid <positive> --clone-root <absolute> --state-root <absolute> --journal-descriptor <absolute descriptor.json> --launch-id <32hex> --output <absolute .mp4> --receipt <absolute .json> --bootstrap <absolute control-state.json>`. Start mode resolves every argument from its typed PowerShell parameters, validates clone/state/output containment and launches the exact freshly built recorder binary hidden; the recorder creates a current-Logon-SID-only random named pipe/capability, writes the ACL-protected bootstrap atomically, validates the descriptor/events prefix and acknowledges ready only after a real main-window WGC frame. Stop mode revalidates bootstrap ACL/hash, recorder PID/start/binary, sends one length-prefixed authenticated `{protocol:"yuee.recorder.control",schemaVersion:1,seq,capability,command:"stop"}`, waits at most five seconds for encoder drain/receipt/clean exit, deletes the bootstrap and proves no recorder survives. Status/duplicate stop are read-only/idempotent; seq gap/replay, capability failure, oversize, premature process exit or timeout fails and then terminates only the recorded exact recorder PID. Thus the production branch has explicit start, dynamic-generation input, stop and cleanup interfaces without enabling the Host evidence pipe.

The fallback is a zero-external-package VS17/Windows SDK 26100 C++/WinRT evidence tool, not product UI. It uses `IGraphicsCaptureItemInterop::CreateForWindow` and `Direct3D11CaptureFramePool::CreateFreeThreaded` with one persistent session for the packaged FE Monster main HWND plus zero or one current UE session. The UE capture item is attached and detached dynamically for each Host-verified `sessionId + processGeneration + owned HWND`: startup/Idle has none; a newly verified generation creates a fresh item; normal exit, expected hide, process death or recovery detaches the old item; a replacement generation must pass the full checks before it can contribute a frame. The recorder follows the normal sanitized Host transition journal under the run's `StableStateRoot` and independently revalidates `GetWindowThreadProcessId`, process-tree membership, `GW_OWNER`, visibility/cloak, DWM extended-frame/client physical rectangles and z-order. A closed/black UE source is a failure only while that exact generation is journaled compositor-visible; during pre-entry, acknowledged hide, exit, expected crash gap and recovery warmup the continuous real main-window capture is the required visible Web/fog underlay. Missing/black main-window frames always fail.

The acceptance clone remains in 1920×1080 borderless application fullscreen at 100% render scale for the entire final clip; resize/move evidence belongs to the separate real window matrix. A D3D11 compositor places the unmodified main-window capture at `(0,0)` and, only while the current UE owned window is actually compositor-visible above it, places the unscaled UE capture at its exact physical intersection according to live DWM rectangles/z-order. It never redraws UI, invents pixels, interpolates a missing source or fills a failed region. Source frames are paired by `Direct3D11CaptureFrame.SystemRelativeTime`/QPC, require finite SDR BGRA color conversion and ≤25ms source gap, and are encoded live as CFR 1920×1080/60 H.264 MP4 through Media Foundation. Wrong owner/PID/generation/rect, unexpected close/black, HDR/color mismatch without deterministic SDR conversion, unavailable WGC/encoder, timestamp gap or any uncovered main pixel terminates capture with a stable error. A sidecar records `recordingMode: "wgc-window-pair"`, the persistent main binding, every UE generation attach/detach reason, source HWND hashes (not raw handles), PID/generation bindings, per-frame source timestamps/rects and encoder identity. This is a faithful live capture of the real z-ordered windows, not post-rendered acceptance evidence.

Although Task 9 keeps `/api/app/recording/save` in the business-data directory and the canonical-package read-only check covers it, calibration/final recording add a second isolation layer: for each run copy the validated canonical package to a unique `<evidenceRoot>/.recording-staging/<32hex>/package/YueE-G0-<buildId>` clone, set `FE_MONSTER_STATE_DIR=<32hex>/state`, and set `FE_MONSTER_DATA_DIR=<32hex>/state/data`. Reject reparse points and verify the clone's manifest/index and every file hash before launch. Inventory the entire `<32hex>` launch root, launch that clone in normal mode with **no** internal-evidence argument, load the fixed song through the ordinary visible file-input/shelf UI, and record. The forced-crash beat uses the acceptance orchestrator to terminate only the exact owned UE PID previously verified as a child of that clone's Host; it does not enable the evidence pipe. The app-recorder branch must create exactly one `state/data/recordings/fe-monster-*.mp4`; the WGC branch is passed one reparse-checked output path `state/data/recordings/yue-e-window-pair.mp4` and may create only that MP4 plus its receipt there. Exactly one branch is designated in `recording-receipt.json`, and no branch may transcode/rename WebM as MP4. The package clone must be byte-identical, and every other created/changed byte must be beneath `state/`, including WebView2, diagnostics and UE Saved/Logs/Config/Crashes/PSO output. Stop/close both recorder and clone, validate 1920×1080/60fps and transition thresholds, hash the designated MP4, then atomically move it to `<evidenceRoot>/acceptance.mp4` and its sidecar to evidence. Delete only the resolved validated `<32hex>` root, require `.recording-staging` empty, and re-enumerate the canonical package against `gate-package-manifest.json`; any extra/changed canonical byte fails Gate. Calibration uses its own throwaway clone and follows the same cleanup.

Record one uncut, fixed-fullscreen 1920×1080 60FPS interaction video showing launch, adjacent button, Web cloud, smooth UE fog reveal, free movement around all three solids with parallax/collision/highlight/shadow, normal exit, re-entry, forced crash recovery and continuing song time. The separate Step 7 evidence records resize/move/DPI behavior so this fixed-canvas transition clip never scales or pads a moving window. `check-yue-e-transition-video.mjs` decodes with installed Edge video+canvas and applies exact thresholds: no PTS gap >25ms; no frame with ≥98% pixels at luma ≤4/255; no one-frame pop where `SSIM(prev,current)<0.70`, `SSIM(current,next)<0.70` and `SSIM(prev,next)>0.98`; no 8×8 block-boundary score >0.08 in the transition ROI; output must remain 1920×1080 with 60fps track metadata.

```powershell
$YueEStage = Get-Content .\out\yue-e\gate0-stage-result.json | ConvertFrom-Json
$YueEConfig = Get-Content .\.yue-e-local.json | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$YueEConfig.edgeExecutable)) { throw 'EdgeExecutableMissing' }
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\run-yue-e-gate0-recording.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -StageResult .\out\yue-e\gate0-stage-result.json `
  -EvidenceRoot $YueEStage.evidenceRoot
if ($LASTEXITCODE -ne 0) { throw "YueERecordingFailed:$LASTEXITCODE" }
. .\scripts\yue-e\invoke-yue-e-node-script.ps1
$YueETransitionReport = Invoke-YueEGateNodeScript -Root (Get-Location).Path `
  -Config .\.yue-e-local.json -Mode Provisioned `
  -Script .\scripts\check-yue-e-transition-video.mjs `
  -ArgumentList @('--config','.yue-e-local.json',
    '--input',(Join-Path $YueEStage.evidenceRoot 'acceptance.mp4'),
    '--report',(Join-Path $YueEStage.evidenceRoot 'transition-report.json'),
    '--edge-executable',$YueEConfig.edgeExecutable) `
  -DescendantPolicy PinnedEdge
if ($YueETransitionReport.ExitCode -ne 0) { throw "TransitionEvidenceFailed:$($YueETransitionReport.ExitCode)" }
```

Capture Unreal Insights in a separate, non-recording run for at least 60 seconds through the real host chain:

```powershell
$YueEStage = Get-Content .\out\yue-e\gate0-stage-result.json | ConvertFrom-Json
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-host-integration.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -Mode PackagedInsights -PackageRoot $YueEStage.packageRoot `
  -Iterations 1 -EvidenceRoot $YueEStage.evidenceRoot
if ($LASTEXITCODE -ne 0) { throw "PackagedInsightsFailed:$LASTEXITCODE" }
```

The evidence-mode host validates root containment and launches UE with exact args `-trace=cpu,gpu,frame,bookmark,region,counters "-tracefile=<validated evidence root>\unreal-insights.utrace"` in addition to required typed session args; `region` and `counters` are mandatory. Only after `revealReady` has been flushed, the Game Thread signals the dedicated `YueE-G0-EvidenceMarker` described in Task 6; that otherwise idle thread begins exactly one Trace Region `YUEE_G0_ACTIVE` and one correctly nested long CPU event `YUEE_G0_ACTIVE_WINDOW`. Accepted `scene.prepareExit` signals it to close the CPU event and then the Region, with duration at least 60.000s; every fault/exit finally closes both once. No long CPU scope remains open on the Game/Render/TaskGraph thread across frames. Optional bookmarks are diagnostic only. Over the same marker interval, the dedicated UE memory sampler emits process-bound local-video-memory usage/budget/PID/generation counters from inside `YueEWorld.exe`; the Host sampler writes QPC-correlated, separately labelled private-bytes/working-set samples for the verified UE PID and Host/WebView2/backend process tree plus audio snapshots outside the package. Any Host/WebView2 DXGI measurement is separately labelled diagnostic and cannot satisfy UE VRAM evidence.

Run the pinned analyzer immediately after trace close:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\analyze-yue-e-insights.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -StageResult .\out\yue-e\gate0-stage-result.json `
  -Trace "$($YueEStage.evidenceRoot)\unreal-insights.utrace" `
  -Output "$($YueEStage.evidenceRoot)\performance-summary.json"
if ($LASTEXITCODE -ne 0) { throw "InsightsAnalysisFailed:$LASTEXITCODE" }
```

`analyze-yue-e-insights.ps1` resolves only `<unrealInstallRoot>/Engine/Binaries/Win64/UnrealInsights.exe`, creates a reparse-free export directory and two response files beneath the evidence root, and runs the same trace through two bounded `UnrealInsights.exe -OpenTraceFile=<validated trace> -AutoQuit -NoUI -ExecOnAnalysisCompleteCmd="@=<validated rsp>"` analyses. Pass 1 contains only `TimingInsights.ExportTimingEvents <...>\active-window.csv -columns=ThreadId,ThreadName,TimerId,TimerName,StartTime,EndTime,Duration,Depth -timers=YUEE_G0_ACTIVE_WINDOW` plus `TimingInsights.ExportTimerStatistics <...>\timer-statistics-{region}.csv -region=YUEE_G0_ACTIVE`, then `Quit`. The script requires exactly one active-window row on thread `YueE-G0-EvidenceMarker`, exact timer name, finite start/end, duration ≥60.000s and valid nesting; it also requires one uniquely named region-statistics file. It then writes Pass 2 with `TimingInsights.ExportTimingEvents <...>\timing-events.csv -columns=ThreadId,ThreadName,TimerId,TimerName,StartTime,EndTime,Duration,Depth -startTime=<invariant-roundtrip-start> -endTime=<invariant-roundtrip-end>` and four separate commands: `TimingInsights.ExportCounterValues <...>\counter-usage.csv -counter="YueE.UEProcess.LocalVideoMemoryUsageBytes" -startTime=<same-start> -endTime=<same-end>`, `TimingInsights.ExportCounterValues <...>\counter-budget.csv -counter="YueE.UEProcess.LocalVideoMemoryBudgetBytes" -startTime=<same-start> -endTime=<same-end>`, `TimingInsights.ExportCounterValues <...>\counter-pid.csv -counter="YueE.UEProcess.Pid" -startTime=<same-start> -endTime=<same-end>`, and `TimingInsights.ExportCounterValues <...>\counter-generation.csv -counter="YueE.UEProcess.ProcessGeneration" -startTime=<same-start> -endTime=<same-end>`, followed by `Quit`. UE 5.8 rejects custom columns for `ExportCounterValues`, so all four commands deliberately omit `-columns`; the analyzer instead requires its fixed emitted header to be exactly `Time,Value`, and self-test rejects any response file that adds CounterValues `-columns`. This two-pass contract deliberately uses documented timer/time filters rather than relying on a region filter for TimingEvents; `-region` is used only by `ExportTimerStatistics`.

UE 5.8 TimingEvents interval export has **overlap**, not containment, semantics. Therefore every Pass 2 timing row must intersect the active window (`EndTime > windowStart && StartTime < windowEnd`), but a parent scope that began before start or ended after end is valid. General timer/thread aggregation records original endpoints and clips duration to `[max(StartTime,windowStart), min(EndTime,windowEnd)]`. Frame/Game-Frame metrics include only complete frames wholly contained in the window and discard at most the one leading and one trailing boundary-partial frame; a fully disjoint row, more than two partial frame rows, invalid/negative clipped duration or empty complete-frame set fails. Counter exports require all four exact files and finite in-window samples; each PID/process-generation sample must equal the verified owned YueE PID/current generation from Host logs, and usage/budget must come from the UE trace with `0 ≤ usage ≤ budget`. Nonzero analysis exit, unknown-option diagnostics, missing columns, duplicate window/region or empty CSV fails. Keep both response files and all CSVs under `automation/insights/` for reproduction.

The analyzer consumes the clipped/intersection-validated Pass 2 timing events and matching region statistics, derives frame durations only from complete accepted Frame/Game-Frame events, and writes formulas plus original/clipped row counts and hashes. `P95` is the nearest-rank 95th-percentile frame ms; `1% Low FPS = 1000 / mean(slowest ceil(0.01*N) frame ms)`; hitch count is frames >50ms. It reports p50/p95/max for Game Thread, Render Thread and GPU; separately labelled UE RAM, Host/WebView2/backend process-tree RAM and combined RAM; audio state; and the **UE-process** DXGI local-video-memory usage/budget counters. UE RAM samples must bind the same verified PID/generation as the trace counters. Require target 60FPS, P95 ≤16.7ms, 1% Low ≥50FPS and zero hitch >50ms. Report SceneCapture and world streaming too; they may be `N/A` only with `Gate0NoSceneCapture` / `Gate0NoStreamingWorld`. `-SelfTest` validates both response files, forbids `-region` on TimingEvents, checks escaping/containment, and recomputes known pass plus P95/1%-low/hitch/window-duration/duplicate-window/duplicate-region/missing-column, valid start-before/end-after overlap, leading/trailing partial-frame discard, fully disjoint row, RAM/VRAM PID-generation mismatch and Host-VRAM-substitution failure fixtures.

- [ ] **Step 10: Collect a complete immutable evidence set.**

`collect-yue-e-gate0-evidence.ps1` creates:

```text
artifacts/yue-e/gates/G0/<buildId>/
  package/YueE-G0-<buildId>/
  gate-report.json
  protected-output-manifest.json
  issues.json
  acceptance.mp4
  transition-report.json
  unreal-insights.utrace
  performance-summary.json
  automation/
  host/
  ipc/
  window/
  audio/
  screenshots/
```

Every report records tool versions, the Step 3 candidate source commit and sanitized machine/driver/display facts. Raw media URLs, tokens, account IDs, private local paths and full exception stacks must be redacted. The collector first finishes and closes **all** media, summaries, raw logs, CSVs, screenshots, `issues.json` and `gate-report.json`; it proves no recording temp clone remains, then writes `protected-output-manifest.json` last. Its JCS canonical evidence index contains every regular file beneath the evidence root **outside** the `package/` subtree, excluding only `protected-output-manifest.json` itself. The entire package subtree is instead represented by one typed binding to the exact `package/YueE-G0-<buildId>/gate-package-manifest.json` SHA-256 and its `protectedFileIndexSha256`; the collector first revalidates that package index, so multi-gigabyte package entries are not duplicated. All non-package files—including `acceptance.mp4`, transition/performance reports, `.utrace`, Insights CSV/RSP, audio/window/host/ipc/automation logs, screenshots, issues and gate report—have normalized path, size and SHA-256 entries. Metadata also records hashes of runtime manifest, host executable, UE executable, map/content asset registry, IPC schemas and all six frozen reference/manifest IDs.

After the protected manifest is written, evidenceRoot becomes read-only to Gate tools. The aggregate checker re-enumerates the entire non-package evidence tree with the same `package/` subtree and self-file exclusions, revalidates the typed package binding, and compares canonical index bytes/hash before accepting. The later metadata-only Gate-record commit binds the protected-output-manifest SHA-256 and does not change or invalidate the Step 3 candidate source revision; replacing any video, report, trace, log or screenshot therefore invalidates the Gate record.

Actually invoke the collector after all raw runs; it reads build identity from the stage result and refuses a manually supplied build ID:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\yue-e\collect-yue-e-gate0-evidence.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -StageResult .\out\yue-e\gate0-stage-result.json
if ($LASTEXITCODE -ne 0) { throw "EvidenceCollectionFailed:$LASTEXITCODE" }
```

- [ ] **Step 11: Write the candidate Gate record and run the aggregate check GREEN.**

Create `docs/superpowers/gates/yue-e-g0.json` from `gate0-stage-result.json` with schema `yue-e.gate-record/v1`, `gate: 0`, exact build ID, `state: "in_review"`, Step 3 candidate source commit, protected manifest SHA-256, local evidence relative path, zero required blocked items, unresolved issue count and `userApproval: null`. Stage this one candidate record, then let the aggregate checker explicitly inspect its staged index bytes:

```powershell
git add -- docs/superpowers/gates/yue-e-g0.json
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-gate0.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -StageResult .\out\yue-e\gate0-stage-result.json `
  -CandidateRecordFromIndex
if ($LASTEXITCODE -ne 0) { throw "CandidateGateAggregateFailed:$LASTEXITCODE" }
```

Expected: exit 0 with the staged candidate `in_review`; no warning/blocked item may be converted to pass.

- [ ] **Step 12: Commit the tracked Gate record.**

Validate once more that `userApproval` remains null, commit the already-staged record, then require the checker to read the record from `HEAD` rather than the worktree/index:

```powershell
git diff --cached --check
git commit -m "docs: mark YueE Gate 0 in review"
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\check-yue-e-gate0.ps1 `
  -Root (Get-Location).Path -Config .\.yue-e-local.json `
  -StageResult .\out\yue-e\gate0-stage-result.json `
  -RequireHeadTrackedRecord
if ($LASTEXITCODE -ne 0) { throw "HeadGateAggregateFailed:$LASTEXITCODE" }
```

- [ ] **Step 13: Stop and present Gate 0 to the user.**

Provide the exact runnable package path, build ID, entry instructions, acceptance video, protected manifest hash, test summary, known issues and a clear statement that the visible subject is only the Gate 0 Blender→UE graybox shell. Do not begin the approved-character Blender model or any Gate 1 file until the user runs/reviews this package and explicitly approves Gate 0. If rejected, change only Gate 0, regenerate the full evidence set and return to `in_review`.

## Final Verification Matrix

Before claiming the plan has been executed, all rows must be green:

| Requirement | Automated proof | Real proof |
| --- | --- | --- |
| Blender 5.2 / UE 5.8 / VS2022 / DX12 locked | toolchain JSON + preflight | build logs |
| Yesterday's character is the future model source | path/dimensions/blob/SHA checker | frozen reference sheet shown in Gate report |
| Map/UI/presets are reproducibly frozen | schemas + exact preset union | offline map and six raw Web screenshots |
| Real Blender geometry reaches UE | FBX validator + import bounds + `PawnNavigation` + exact loaded-map handshake | free camera parallax/collision/light response |
| No Blender final material/render | FBX payload checks | UE asset/source provenance report |
| Independent secure process | harness PID/path/DACL/Job tests | packaged kill/orphan test |
| Owned non-child UE window | style/owner probes, no YueE `SetParent` call | move/resize/DPI/focus video |
| Three real successful Presents before reveal | native present-count logs | packaged DX12 handoff video |
| No abrupt appearance or black frame | transition frame analyzer | uncut 60FPS recording |
| Button is beside sandbox and embedded-only | DOM/static/browser tests | packaged app interaction |
| Web visual loops pause, player stays live | scheduler/probe tests | CPU trace + continuing song |
| Same main `#audio` and song clock | identity/mutation/queue tests | loopback capture + 20-cycle run |
| UE has no second main-song audio | content/package scans | loopback single-sink proof |
| Crash/pipe/heartbeat recovery | fake + packaged fault matrices | visible recovery ≤250ms |
| 20 cycles leave no residue | process/window/handle snapshots | final clean process tree |
| Gate package and evidence are immutable | canonical SHA manifests | `YueE-G0-<buildId>` opens on review machine |

## Official Implementation Sources

- [Unreal Engine: Packaging Your Project](https://dev.epicgames.com/documentation/en-us/unreal-engine/packaging-your-project)
- [Unreal Engine: Build Operations, Cooking, Packaging, Deploying and Running](https://dev.epicgames.com/documentation/unreal-engine/build-operations-cooking-packaging-deploying-and-running-projects-in-unreal-engine)
- [Unreal Engine: Run Automation Tests](https://dev.epicgames.com/documentation/en-us/unreal-engine/run-automation-tests-in-unreal-engine)
- [Unreal Engine: Automation Test Framework](https://dev.epicgames.com/documentation/en-us/unreal-engine/automation-test-framework-in-unreal-engine)
- [Unreal Engine 5.8: Timers/Counters and headless Timing export commands](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-the-timers-and-counters-tabs-in-unreal-insights-for-unreal-engine)
- [Unreal Engine 5.8: Timing Regions track](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-the-timing-panel-in-unreal-insights-for-unreal-engine)
- [Unreal Engine 5.8: FBX Content Pipeline / 2020.2 importer](https://dev.epicgames.com/documentation/unreal-engine/fbx-content-pipeline?lang=en-US)
- [Microsoft: Window Features and Owned Windows](https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features)
- [Microsoft: GetNamedPipeClientProcessId](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeclientprocessid)
- [Microsoft: Named Pipe Security and Access Rights](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)
- [Microsoft: Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
- [Microsoft: IDXGIAdapter3::QueryVideoMemoryInfo current-process usage/budget](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_4/nf-dxgi1_4-idxgiadapter3-queryvideomemoryinfo)
- [Microsoft: QueryDisplayConfig active display paths](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-querydisplayconfig)
- [Microsoft: GetDpiForMonitor effective DPI](https://learn.microsoft.com/en-us/windows/win32/api/shellscalingapi/nf-shellscalingapi-getdpiformonitor)
- [Microsoft: IGraphicsCaptureItemInterop::CreateForWindow](https://learn.microsoft.com/en-us/windows/win32/api/windows.graphics.capture.interop/nf-windows-graphics-capture-interop-igraphicscaptureiteminterop-createforwindow)
- [Microsoft: Windows Graphics Capture frame pools and QPC timestamps](https://learn.microsoft.com/en-us/windows/apps/develop/media-authoring-processing/screen-capture)
- [Blender 5.2 LTS release](https://www.blender.org/download/releases/5-2/)
- [Official Blender 5.2 binary index](https://download.blender.org/release/Blender5.2/)
- [Blender 5.2 Manual: Command Line Arguments](https://docs.blender.org/manual/en/5.2/advanced/command_line/arguments.html)
- [Blender Release Compatibility and LTS Policy](https://developer.blender.org/docs/release_notes/compatibility/)
- [Blender official add-ons mirror: FBX exporter version 7400](https://github.com/blender/blender-addons/blob/main/io_scene_fbx/fbx_utils.py)

## Gate 0 Stop Condition

The executor stops when and only when a complete `YueE-G0-<buildId>` has passed the matrix, `docs/superpowers/gates/yue-e-g0.json` says `in_review`, and the user has been given the package and evidence. The next action after this plan is user acceptance or Gate 0 correction—not Gate 1 implementation.
