# FE Monster“遇E”Blender + Unreal Engine 5.8 无边界 3D 音乐探索场景设计

日期：2026-08-22

状态：全部设计章节已在对话中逐节批准，等待书面复核

变更类型：对 2026-08-21 Three.js 方案的完整架构修订

首发平台：Windows 11 / Win64 / DirectX 12

权威性：本文是“遇E”当前唯一有效设计规格；此前基于 Three.js、GLB Web 运行时和“同一 DOM 节点迁移”的规格内容及 Phase 1 计划均被本文取代，不得执行

## 1. 目标

在现有 FE Monster 音乐客户端中新增名为“遇E”的真实三维开放世界。它不是壁纸、视频背景或二维角色界面，而是可由原创卡通角色自由行走、奔跑、跳跃、滑翔、攀爬和翻越的非战斗探索空间。

本设计必须同时满足：

1. 在现有“沙盒模式”旁增加“场景”按钮，用于进入“遇E”。
2. “遇E”是整个世界的名字；“音乐区”只是世界中的一块固定区域。
3. 音乐区是默认重生点、空间音频核心以及高空预设和功能 UI 的集中区域。
4. 世界不存在空气墙、海域终点或可见地图边缘，并保留大量空地供以后扩展。
5. 角色是清晰、立体、非真人的卡通人物，严格执行用户参考图的比例、面罩、发型、服装大形和柔和发光效果。
6. 第一人称、第三人称和滑翔镜头可以平滑切换。
7. 走、跑、跳、滑翔、攀爬和翻越动作必须连续自然，不出现硬切、关节弹跳或明显滑步。
8. 场景预设和其他空间 UI 是独立组件，位于音乐区高处，尺寸巨大，约 45° 俯视人物。
9. 场景预设实时播放内容；选择一个预设时，其余预设平滑隐藏，选中项平滑移到中心并放大。
10. 现有歌单和歌曲 UI 以同一套 HTML、CSS、交互语义和播放器状态在空间中显示，不建立第二套播放器。
11. 拖动枪可以选择、移动、统一缩放、旋转、撤销、重做、复位和持久化空间 UI。
12. 外围世界加入非战斗探索、环境谜题和新的探索成就。
13. 画面原生清晰，不使用胶片颗粒、像素噪点、马赛克或突然弹出的内容。
14. 每一阶段完成后必须先提供可运行的真实 3D 验收包，经用户确认后才能进入下一阶段。

## 2. 固定术语、来源优先级与范围

### 2.1 固定术语

- **遇E**：整个无边界三维世界的名称。
- **音乐区**：遇E中的固定核心区域；包含重生点、空间音频声源、高空预设廊、歌单、播放控制和其他空间 UI。
- **遇E旅人**：用户控制的原创卡通三维角色。
- **音乐区声源锚点**：主歌曲在三维声场中的逻辑发声位置。
- **空间组件**：可独立生成、命中、显示、隐藏、变换和保存的 Unreal Actor。
- **拖动枪 / 引力工具**：只操作已注册空间 UI 的非战斗工具。
- **逻辑区块坐标**：不受本地坐标重定位影响的 64 位世界位置。
- **视觉覆盖**：UE 窗口覆盖在主 WebView2 内容区上方；主 WebView2 文档和音频链保持存活。

### 2.2 视觉来源优先级

1. 本文的书面职责、交互、安全和验收规则；
2. 用户于 2026-08-22 最新指定的 `CharacterMaster-01`、`CharacterMotionReference-01` 和 `CameraCompositionReference-01`；
3. Gate 1 基于该母版完成并获批的原创三视图、背面图、材质色板和 UE 实时转台；
4. 地图概念图只表达空间拓扑或构图意图，不能冒充真实三维验收。

正式人物基线是仓库内以下三个已跟踪只读制品；Gate 0 必须把路径、尺寸、Git blob 与 SHA-256 一并写入受保护参考 manifest：

- `CharacterMaster-01`：`docs/superpowers/assets/yue-e/e-traveler-approved.png`，1536×1024，SHA-256 `FE9724E075730551AC657D93C81D3FFFA878C7E0A1D65F454FF890901D3F6F6D`；
- `CharacterMotionReference-01`：`docs/superpowers/assets/yue-e/e-traveler-actions-approved.png`，1774×887，SHA-256 `468E922942179B00659F5B16CAF7361D059B7CB6E2ACEEC947867F93DB4EEB55`；
- `CameraCompositionReference-01`：`docs/superpowers/assets/yue-e/camera-views-approved.png`，1817×866，SHA-256 `1429B87737E92FFFAABA44577AF3579556B558F488A2A88787D20F7653312FBF`。

后来提供的 `share_10a4121c1a71fb9d6d86629cdb6df70f.png`（SHA-256 `49D58F180BEF937EDD3DDD682CEAACCCE903F9E83C2B02FC6E94CEE39431183A`）降为历史风格参考，不再决定 Gate 1 外形，也不构成 Gate 0 阻塞条件；若归档则必须进入访问受控、非发布制品库，不能混入发布资产。

### 2.3 不在首版范围内

- 不加入敌人、生命值、武器、攻击、伤害、受击、战斗任务或战斗奖励。
- 不把世界做成固定尺寸关卡、循环地图、传送边界或空气墙沙盒。
- 不使用二维人物贴片、预渲染人物视频或面向镜头的平面冒充角色。
- 不让 Unreal 启动第二路歌曲播放器，不把歌曲 PCM、Blob URL 或播放时钟迁移到 UE。
- 不复制、提取或反编译《光·遇》的模型、贴图、骨骼、服装、关卡、符号、动画或音频资产。
- 不复用现有桌面壁纸 `DesktopSceneHost` 作为遇E宿主。
- Windows 首版通过前，不同时开发 macOS、Android 或 iOS 运行时。

### 2.4 “整个场景使用 Blender + UE”的边界

全部可见三维几何源资产必须走 Blender → UE；全部三维材质、纹理绑定、灯光、动画、VFX、物理、组装和最终画面必须在 UE 完成。现有歌曲、HTML/CSS 歌单、WinForms 宿主、Java 服务和账号数据不是三维场景资产，因此继续留在原系统。

## 3. 原创性与人物母版

《光·遇》只作为品质标杆和设计方法参考：小角色与大世界的比例、低压探索、柔和光雾、空地留白、远景地标和滑翔观景。

`CharacterMaster-01` 锁定首发唯一默认母版：

- 约 3.2–3.8 头身的幼年卡通比例，短躯干、大头、略大的手套形手部和鞋靴；
- 深靛蓝近黑面罩，无真人鼻口，只保留两条克制的暖琥珀横向光眼；
- 珍珠白块面层叠短发、左右外翘发束和头顶小翘发，不使用真实发丝；
- 米白高领短衣、暖橙下摆与小三角标、深海军蓝灯笼短裤、奶白软靴；
- 胸前暖琥珀圆形光核，以及左腕青蓝发光圆环装置；
- 背部左右各三片、共六片有厚度的透明分段翼；收拢时保持小巧层叠轮廓，滑翔时展开为 `CameraCompositionReference-01` 中的宽翼姿态；
- 柔和卡通材质、干净轮廓、暖边光和轻微辉光，不出现皮肤毛孔、真人五官、真实发丝或写实人体比例。

`CharacterMotionReference-01` 只锁定待机、步行、跑动、跳跃、展开翼、攀爬和翻越时的轮廓与气质；`CameraCompositionReference-01` 锁定第一/第三人称观察中的比例和翼展可读性。两者都是建模与动作目标，不是二维贴片或预渲染验收物。

“按昨天出的图做”表示严格执行上述比例、轮廓、配色、服装、光眼、腕环和透明分段翼，不表示复制原游戏资产。所有网格、拓扑、骨骼、UV、材质图、动画和服装模块都必须从零原创制作。

## 4. 已选总体架构

### 4.1 混合应用架构

保留现有 FE Monster 应用外壳、账号、播放器、歌单、设置和数据服务；新增独立打包的 Unreal 运行时：

```text
主应用
  WinForms + WebView2 + Java 服务
  ├─ 唯一播放器、歌曲时钟、歌单、账号、设置
  ├─ UE 进程生命周期、窗口定位、IPC、安全和持久化
  └─ 沙盒模式旁“场景”入口

遇E
  YueEWorld.exe / Unreal Engine 5.8
  ├─ 三维世界、角色、相机和输入
  ├─ 材质、纹理、光影、动画、物理和最终渲染
  ├─ 空间 UI、实时预设和拖动枪
  └─ 向宿主发送交互意图与空间听者姿态

资产源
  Blender 5.2 LTS
  └─ 只负责原创几何、骨骼、蒙皮、UV、LOD、碰撞代理和插槽
```

### 4.2 进程和能力所有权

| 能力 | 唯一权威 |
| --- | --- |
| 歌曲源、播放时钟、歌单、播放控制 | 主 WebView2 中的现有播放器 |
| 账号、设置、成就持久化 | 现有应用与 Java 服务 |
| UE 进程、窗口、会话和 IPC | WinForms `UnrealWorldHost` |
| 角色、相机、三维输入和玩法 | `YueEWorld.exe` |
| 世界材质、光照、动画、VFX 和最终画面 | Unreal Engine 5.8 |
| 原始模型、骨骼、蒙皮、UV、LOD | Blender 5.2 LTS |
| 主歌曲空间声场和最终音乐输出 | 现有 Web Audio / XAudio2 / OBR 管线 |
| 脚步、风、环境和 UI 音效 | Unreal 音频系统 |

独立进程使 UE 拥有完整 D3D12 交换链，同时让 UE 崩溃、升级或重启不拖垮播放器进程。UE 采用 owned top-level 窗口，不使用跨进程 `SetParent`。

## 5. 工具链与源目录

### 5.1 固定版本

- Blender 5.2 LTS，使用项目固定小版本和便携配置；
- Unreal Engine 5.8，未经单独批准禁止升级；
- Visual Studio 2022、Windows 11 SDK、Win64、DirectX 12；
- FBX 遵循 UE 5.8 的 2020.2 管线约束；
- `.blend`、`.fbx`、`.uasset`、贴图和验收录像使用 Git LFS 或制品存储，打包结果不混入普通源码提交。

### 5.2 目标目录边界

```text
art/blender/yue-e/
  character/
  environment/
  export/

unreal/YueEWorld/
  YueEWorld.uproject
  Source/
  Content/
  Config/

native/windows/winforms/yue-e/
  UnrealWorldHost.cs
  YueEIpcProtocol.cs
  YueELayoutStore.cs

web/scene-widgets/
artifacts/yue-e/gates/
```

目录名是实施目标；书面规格通过后由实施计划确认与现有仓库结构的最终融合方式。

## 6. Blender → Unreal 资产契约

### 6.1 Blender 允许负责

- 静态网格和骨骼网格的原创建模；
- 骨骼层级、蒙皮权重和基础形变目标；
- UV0、UV1、顶点色、法线和切线准备；
- LOD 网格、简单碰撞代理和 socket/挂点定位；
- 模块拼接边界、枢轴、命名、单位和导出验证；
- 保存 `.blend` 源并导出不含最终材质与动画的 FBX。

### 6.2 Blender 禁止负责

- 最终材质、贴图绑定和着色器；
- 天空、灯光、雾、后处理和最终渲染；
- 正式动作片段、状态机、IK 和运动匹配；
- 粒子、天气、碰撞行为、世界生成和玩法逻辑；
- 烘焙视频或图片冒充运行时三维效果。

### 6.3 Unreal 负责

- 导入静态/骨骼模型、皮肤、LOD、碰撞和 sockets；
- 所有 Master Material、Material Instance、纹理绑定和玻璃效果；
- Lumen、Virtual Shadow Maps、天空、雾、后处理和最终实时渲染；
- Control Rig、Animation Blueprint、Motion Matching、Full Body IK、Motion Warping 和 Root Motion；
- Niagara、天气、碰撞、角色控制、攀爬、滑翔和相机；
- World Partition、PCG、HLOD、空间 UI、音效和打包。

### 6.4 交换约束

- Blender 使用米制、Z 轴向上；UE 导入后 1m 必须等于 100cm；
- 导出前应用对象旋转和缩放，不允许负缩放、非统一骨骼缩放或重复骨骼名；
- FBX 导入固定：`Import Materials=false`、`Import Textures=false`、`Import Animations=false`；
- Blender 只保留用于分槽的占位材质名；
- LOD、socket、碰撞和模块边缘必须通过自动导入检查，失败资产不得进入主地图。

## 7. 遇E旅人

### 7.1 默认造型和模块

- 约 3.2–3.8 头身，头部大、肩窄、躯干短，四肢和动作剪影清楚；
- 深靛蓝近黑面罩配两条暖琥珀横向光眼，不制作鼻、口或真人眼球；
- 珍珠白层叠块面短发、外翘侧发束和头顶小翘发；
- 米白高领短衣、暖橙下摆与三角标、深海军蓝灯笼短裤和奶白软靴；
- 胸口暖琥珀圆形光核，左腕青蓝发光圆环装置；
- 略大的圆润手套形手部和鞋靴；
- 背部六片透明分段翼具有玻璃般体积和倒角；地面时收拢为紧凑层叠轮廓，滑翔时展开为宽阔卡通翼形。

发型、上衣、下装、鞋靴、光眼、腕环、胸口光核和分段翼预留模块化插槽，但 Gate 1 只生产和验收这一套默认造型。所有模块共用批准骨架、穿插规范和 LOD 契约。

### 7.2 模型预算

- LOD0 目标 45k–80k 三角形；LOD1 约 50%，LOD2 约 20%；
- 变形骨骼建议不超过 120，单顶点权重不超过 4；
- 角色、头发、衣装、鞋靴、腕环、分段翼和光核必须有真实厚度、自遮挡、阴影和材质响应；
- 不使用面向镜头的角色身体、头发、衣装或翼面贴片；
- UE 交付包含 Skeletal Mesh、Skeleton、Physics Asset、Control Rig、AnimBP 和材质实例。

### 7.3 人物外观闸门

正式动作制作前必须交付 Unreal 实时转台：

- 正面、45°、侧面、背面、俯视和低角度；
- 中性、暖逆光和冷雾三种 UE 灯光；
- 可自由旋转和缩放的 Windows 可运行包；
- 4K 近景图展示面罩光眼、头发、衣装、腕环、胸口光核、分段翼和鞋靴；
- 与 `CharacterMaster-01` 正背面并排逐项说明比例、轮廓、配色和部件对应关系；
- 资产来源清单证明没有可识别的《光·遇》专有网格、纹样、拓扑或提取资产。

用户未批准 Gate 1 时，不进入正式动作制作。

## 8. 动画、移动与相机

### 8.1 动画系统

所有正式动画均在 Unreal 中制作并烘焙为 AnimSequence：

- Control Rig 负责控制和修正；
- Animation Blueprint 管理分层状态和参数；
- Motion Matching 选择地面运动片段；
- Full Body IK 处理脚底、坡面、攀爬和手脚接触；
- Inertialization 消除状态硬切；
- Motion Warping 对齐抓边、翻越和落脚点；
- Root Motion 只用于明确标注的翻越、抓边和特殊落地；
- 普通走跑由 Character Movement 主导，避免动画与碰撞位置分离。

### 8.2 必需动作

- 呼吸、待机、环顾和重心微调；
- 起步、八方向走路、慢跑、冲刺、急停、180° 转身和小步修正；
- 跳跃预备、起跳、腾空、短落地、重落地和恢复；
- 抓边、攀爬待机、上下左右攀爬、翻越和放手；
- 分段翼展开、悬停、普通滑翔、俯冲、转弯、减速和收翼；
- 拖动枪装备、瞄准、拖动、缩放、旋转和收起。

首版攀爬只作用于经过标签或几何规则验证的可攀表面与抓点，不承诺任意动态几何自由攀爬。体力耗尽后平滑下滑至最近安全支点或无伤安全点，不进入死亡状态。

### 8.3 动作品质门槛

- 走跑过渡约 0.18s，起跳约 0.12s，落地恢复约 0.22s；
- 第一/第三人称切换约 0.45s；
- 在平地、坡面和转向接触期采样的可见足部滑动不超过 2cm；
- 首次触发任何动作不得产生 shader 或动画加载卡顿；
- 不允许关节弹跳、翼片/衣装穿身、IK 突跳、固定帧率计时或动画硬切；
- 动画、物理和镜头全部使用实际 delta time。

### 8.4 相机

- 第三人称默认略高于肩部，使用阻尼和碰撞球避免穿墙；
- 第一人称只在本机第一人称层隐藏头发和头部，身体、双臂、拖动枪和身体阴影仍存在；
- 滑翔自动采用更远、前瞻更强的追随镜头；
- 切换期间连续混合位置、FOV 和角色可见层，不冻结移动、UI 或歌曲；
- 任何镜头模式都能观察和操作空间预设。

## 9. 材质、光影与画面质量

### 9.1 视觉方向

采用柔和卡通 PBR，而不是纯平面描边或真人写实：

- 大形体、干净色块、柔和粗糙度和克制高光；
- 暖主光、冷环境光、柔和边缘光和体积雾；
- 角色与地面、岩石、植物、云层和硬玻璃保持明确材质区分；
- 小型发光物优先使用真实点光或矩形光，不依赖大量极小高亮 Emissive 参与 Lumen GI；
- 禁止真人皮肤、毛孔、真实发丝、照片纹理和颗粒法线。

### 9.2 材质族

- `M_YueE_Character`：大色块 Base Color、稳定 Roughness、轻量织物法线、可选受控 Subsurface；不模拟真人皮肤。
- `M_YueE_Environment`：地形/岩石/遗迹共用分层参数，宏观颜色和近景法线分离。
- `M_YueE_Foliage`：Masked 叶片、受控 WPO 风动和距离 LOD；不使用噪点透明渐隐污染近景。
- `M_YueE_GlassUI`：有厚度玻璃、倒角高光和克制折射；UI 内容使用独立清晰内容面，不被折射或辉光模糊。
- `M_YueE_Emissive`：限制峰值和 Lumen 贡献，小亮物以实际灯光补充照明。

所有实际资产使用 Material Instance，不允许每个对象复制一套无法统一调参的独立主材质。

### 9.3 渲染设置

- Unreal Engine 5.8、DX12、Lumen GI/Reflections、Virtual Shadow Maps；
- Volumetric Fog、Sky Light 和受控后处理；
- Windows 主验收使用原生 1920×1080、100% 渲染比例并关闭动态分辨率；
- 关闭 Film Grain、Chromatic Aberration、噪点式效果和可见抖色；
- Motion Blur 只保留极低强度或默认关闭；
- 使用高质量抗锯齿/TSR 配置和各向异性过滤；主验收仍以原生 100% 输出，不用升频掩盖低分辨率；
- UI RenderTarget 独立维持像素清晰度；
- 性能不足时先降低远景阴影、雾采样、反射和植被密度，人物与空间 UI 不首先降清晰度。

### 9.4 无突然出现

- 进入前预热核心 shader、PSO、角色动作、玻璃材质和音乐区首屏；
- UE 只有在关键资产常驻且连续报告 3 个安全帧后才能展示；
- 世界区块先在不可见状态完成几何、碰撞和材质准备；
- 未就绪区域由真实云层、山体、远景代理和雾带遮挡；
- HLOD 与完整模型在足够远距离匹配切换，不在近景使用可见颗粒抖动；
- 首屏纹理必须驻留、角色必须已有合法姿势、预设 RenderTarget 必须已有合法帧；
- 任何卡片、面板、模型或区块都不得先清空再突然显示。

## 10. 世界架构

### 10.1 双层世界

遇E采用“手工核心 + 确定性无边界外围”：

- 音乐区和批准地图中的六个关键地域是手工设计内容；
- World Partition 管理固定地域、Data Layers 和距离流送，但不把 World Partition 本身描述为无限生成器；
- PCG 只组合和分布已批准的 Blender 模块，不取代原创建模；
- 外围由逻辑瓦片、Actor/组件池和确定性种子持续生成与回收；
- Large World Coordinates 与独立 64 位逻辑坐标共同避免远距离精度问题。

“无边界”不表示一次性在内存中创建无限几何，而表示没有可见地图终点，逻辑坐标可持续扩展，玩家周围有限资源环持续回收并可由稳定种子重建。

### 10.2 区块、坐标和流送

- 基础逻辑区块：256m × 256m；
- 内圈 3×3：完整碰撞、互动、攀爬和收集；
- 中圈 5×5：完整可见资产提前加载；
- 外圈：HLOD/Nanite 山体、云层、遗迹和岛屿轮廓；
- 根据人物速度、朝向、滑翔高度和镜头方向预取；32m/s 验收速度下沿前向至少覆盖 6 秒预测；
- 玩家 Controller 是主要 Streaming Source，归音光门目标使用临时高优先级 Streaming Source；
- PCG 种子由世界版本和 64 位逻辑区块坐标共同生成；同一版本同一坐标必须重建相同稳定对象；
- 区块状态固定为 `absent → prefetch → ready-hidden → active → retiring → pooled`；
- 队列有界，优先级为碰撞/人物邻近 → 近景材质 → 互动 → 远景装饰。

系统不变量：

- 任何进入 `active` 的内圈区块都必须已有碰撞、连续安全通路和全部四边共享采样；
- 任意相邻逻辑区块的共享边高度、材质域、植被屏蔽和雾/音频过渡必须相等；
- 池或队列接近上限时先回收最远 `retiring` 内容，不得通过阻断前方、回弹人物或生成隐形墙维持预算；
- 任何已访问 `(worldVersion,tileX,tileY)` 返回后必须重建相同稳定 ID 和关键布局；
- 所有 int64 坐标加减采用 checked/饱和保护，失败进入可解释安全恢复，不能溢出形成隐式边界。

### 10.3 原点重定位

- 固定手工核心使用 UE LWC；外围另存 `int64 tileX/tileY + double offset` 逻辑坐标；
- 当活动人物距离当前局部原点超过约 2km 时，由 `YueEWorldSubsystem` 在单个 pre-physics 边界原子调整世界原点；
- 人物、相机、已加载区块、空间 UI、最近安全点、Streaming Sources 和音频局部换算必须在同一事务中更新；
- 原点重定位不计入行走距离、成就、速度、音频多普勒或动画根运动；
- 重定位不得造成一帧输入停顿、碰撞丢失、IK 跳动、空间声跳变或卡片漂移；
- 音乐区保存逻辑原点 `(0,0)`，不依赖任何一次临时本地坐标。

### 10.4 已批准地域

本文 10.4 的六域拓扑、音乐区固定性和地域机制共同构成当前 `WorldMapReference-01` 文字基线。此前获批的地图概念尚没有仓库内可复现哈希；Gate 0 必须把同一布局整理为俯视 blockout、区域 ID/邻接表和 SHA-256 manifest，并先向用户确认该制品只是归档已批准地图而非重新设计。Gate 3 只以该 manifest 和本文为验收来源。

| 地域 | 核心体验 | 非重复机制 |
| --- | --- | --- |
| 风弦草原 | 草浪、低空滑翔、远景地标 | 上升气流与风弦 |
| 云脊空庭 | 云海、浮岛、长距离滑翔 | 连续高空路线与云门 |
| 风暴回廊 | 强风、避风壁、风眼 | 风向窗口判断 |
| 镜雨海岸 | 潮汐、雨水显纹、反射 | 水镜共鸣 |
| 雾音林地 | 浓雾、隐藏洞穴、环境回声 | 听声寻路及视觉辅助 |
| 沉响峡谷 | 攀爬、翻越、声塔 | 垂直声路和高点滑翔 |

每个地域至少有一条易达主路、一条可选支路、一个远景奇观和一个原创机制。关键谜题使用手工或经过验证的确定性内容，不能由 PCG 跨瓦片拼成死局。

### 10.5 留白、拼缝与失败回退

- 地域之间及外围保留大片可通行草坡、云海、荒地、风场和空中平台；
- 每个区块保留版本化未来内容插槽；
- 相邻块共享边缘高度、材质、植被、雾和环境音采样，不能出现接缝；
- Landscape、样条或地形贴合只能组装、变形或分布 Blender 原创源模块；如使用 Landscape heightmap，其源数据必须由批准的 Blender 地形导出，UE 编辑器不得另行雕刻新的美术形体；
- 生成失败时保持可通行低细节安全地形并后台重试，禁止空气墙、回弹和强制传送；
- 急转、俯冲和回头都纳入无 pop-in 验收。

低细节安全地形、Gate 0 灰盒、Gate 2 动作测试场和全部用户可见测试几何也必须由 Blender 源文件导出。至少提供 `SM_YueE_FallbackTile`、`SM_YueE_TestGround` 和 `SM_YueE_TestCardFrame`；UE Engine 原始 Cube/Plane 只可作为开发调试辅助，不能出现在用户验收包。

### 10.6 音乐区固定性

- 音乐区逻辑原点永久固定，不参与外围池化；
- 它是正常进入、重新进入和无有效恢复点时的默认重生点；
- 坠落优先回到最近稳定安全点，不等同于重生；
- 玩家可通过“归音光门”返回音乐区；必须先加载目标，再通过光和雾平滑过渡；
- 音乐区是空间音频核心，不是整个世界的别名。

### 10.7 无边界属性与故障测试

除 30 分钟人工路线外，自动属性测试必须覆盖：

- 大量随机正/负逻辑坐标及接近约定安全上限的 checked 运算；
- 同一路线反复往返、蛇形移动、原点重定位后返回旧区块；
- Actor/RenderTarget 池耗尽、加载队列背压、单块/连续多块生成失败；
- worldVersion 升级前后稳定 ID 和显式迁移；
- 32m/s 前进、180° 急转、俯冲和镜头回看组合；
- 故障期间任一被激活内圈仍有连续可通行的 Blender 安全地形，不产生隐式边界。

## 11. 音乐区空间 UI

### 11.1 空间布局

- 预设廊位于音乐区左前高空；歌单/播放组位于右前高空；功能坞和按需面板位于另一侧无遮挡空域；
- 面板中心通常位于人物上方约 6–10m，尺寸巨大，默认 pitch 约向下 45°；
- 音乐区把全部 NavMesh、批准攀爬路线和第一/第三人称相机可达范围定义为 `MusicZoneReadableVolume`，在其中保持到空间 UI 的无遮挡视廊；“任意角度可见”覆盖这个连续可达体积，不表示隔墙或隔山 X-ray 显示；
- 卡片拥有真实玻璃厚度、倒角、阴影和碰撞；
- 玻璃框架和背壳几何由 Blender 建模并通过 FBX 导入，UE 只负责玻璃材质、内容面、碰撞行为和渲染；
- 正反面分别正确渲染文字与内容，背面不得显示镜像文字；
- 从侧面能看见厚度，从所有批准观察点都能读取内容。

### 11.2 朝向与用户旋转

- 默认 `FollowUser` 模式：保存用户局部旋转偏移，再叠加平滑 LookAt yaw 与自适应 pitch；目标内容面法线与视线夹角不超过 35°，名义俯角仍约 45°；
- 拖动枪旋转修改保存偏移；只要偏移不会破坏可读角，系统保持它，接近侧缘时平滑增加运行时纠正，离开后恢复用户偏移；
- `Pinned` 固定卡片锚点、比例和用户保存的名义旋转，不让拖动结果漂移；为满足连续可读性，Actor 外层 `ReadabilityPivot` 可在名义旋转之上平滑施加运行时 LookAt 纠正，玻璃框、背壳、内容面、碰撞和柔光作为一个刚体共同转向，禁止内容面单独穿出或脱离玻璃框；
- 从 `MusicZoneReadableVolume` 任一点连续绕行 360°、改变合法相机高度和切换第一/第三人称时，内容法线夹角保持不超过 35°、投影宽度不低于正视的 70%，正文仍满足最小像素高度；
- 朝向修正使用阻尼，不瞬间翻面；双面内容在跨越正反法线时交叉切换，文字不镜像；序列化只保存名义 transform，不保存瞬时 `ReadabilityPivot`，射线命中始终使用当前显示刚体的真实碰撞。

### 11.3 组件模型

每个空间面板是独立 Unreal Actor，至少包含稳定组件 ID、Widget/内容面、硬玻璃背板、碰撞、hover 柔光、默认与当前 transform、显示/聚焦动画、序列化版本和错误态。

首版 Actor 类型：

- `PresetCardActor`
- `PlaylistPanelActor`
- `PlaybackControlsActor`
- `FunctionButtonActor`
- `SearchPanelActor`
- `SettingsPanelActor`
- `AchievementPanelActor`

“小组件”表示职责独立和可单独管理，不表示视觉尺寸小。

### 11.4 场景预设和调度

- 每个预设使用 SceneCapture + RenderTarget，禁止静态截图冒充实时画面；
- 聚焦卡片目标为 2048 级 RenderTarget/60Hz；hover 或最近可读卡片目标为 1536 级/30Hz；普通可见卡片使用 1024 级/12–15Hz 轮询更新；
- 全部可见卡片必须持续动画，低优先级只降低更新频率，不能停成静态图；
- 每帧 SceneCapture GPU 预算目标不超过 4ms，超预算时轮询降频而不是降低焦点清晰度；
- RenderTarget 使用有界池，分辨率切换只在新目标已有合法帧后交叉淡化；
- 点击一个预设时只平滑隐藏其他预设，不隐藏歌单、播放和功能 UI；
- 选中预设约 0.48s 平滑移到中心并放大，退出后恢复保存布局。

### 11.5 现有歌单 UI

歌单面板通过 UE Web Browser Widget 的场景模式加载与现有应用相同的 HTML、CSS、组件代码、文本、图标和功能。

约束：

- 这是视觉与功能无损复用，不是跨进程搬移或共享同一个 DOM 节点；
- 场景浏览器不共享主 WebView2 的 `<audio>`、AudioContext、Blob URL 或播放时钟；
- 场景模式禁止创建任何第二音频实例或原生空间会话；
- 只读数据可以从现有本地服务获取；播放修改必须经 WinForms 转发到主 WebView2 命令总线；
- 只有歌单/歌曲这一块使用浏览器表面，其他小组件优先使用 UMG；
- Gate 4 必须验证打包后的中文输入法、滚轮、焦点、键盘、DPI、透明背景、候选窗、断线恢复和外链导航拦截；
- 核心功能回归必须与原 UI 等价，关键视觉比较不得出现可察觉的结构、字体、间距或状态损失。

Gate 0 必须冻结 `SceneUIManifest-v1` 和 `PresetManifest-v1`：

- 必须共用 Web 组件代码的范围为 `#orbPlaylists`、`#playlistShelf`、`.player-dock` 及其歌曲行、封面、进度和播放状态；
- 搜索建议等已有复杂文本输入可列为 `SharedWebComponent`；设置、成就和功能快捷键可列为 `UMGAdapter`，但命令和状态仍来自原系统；
- 每项记录稳定组件 ID、源 selector/module、允许实现类型、命令集合、视觉基准哈希和是否可拖动；
- Preset manifest 枚举全部现有内置预设及稳定 ID，用户预设通过同一注册协议动态加入；
- Gate 5 的“全部”只以这两个获批 manifest 为准，新增应用功能需显式更新 manifest。

### 11.6 Hover 与清晰度

- 准星或拖动枪靠近可操作对象时，在约 80ms 内出现柔和高亮；
- 未命中时不产生误导性发光；
- 焦点面板不得因放大变糊；
- 设计交互距离下，1080p 主标题投影高度至少 32px、正文至少 24px；
- 100%、125%、150% Windows DPI 下文字、图标、准星和卡片边缘必须清楚；
- 不用颗粒噪声、像素化辉光或低分辨率放大制造气氛。

## 12. 拖动枪

### 12.1 权限和操作

拖动枪只能命中注册了 `YueE.SpatialUI`/`SpatialUIManipulable` 标签的 Actor。它不能选择人物、地形、遗迹、植物、冒险机关或普通世界物体，也没有攻击效果。

- 悬停：高亮目标并显示可操作轮廓；
- 按住主操作键：沿安全工作平面拖动位置；
- 滚轮：统一缩放；
- `Q/E` 或重映射输入：旋转；
- 撤销/重做：恢复已确认变换历史；
- 复位：恢复默认 transform；
- 取消：回到本次抓取前的已确认状态；
- 松手：提交最终 transform 并等待宿主确认。

### 12.2 安全约束

- 限制最小/最大比例、距离、高度、人物 2.5m 安全半径、重生点、出口和冒险路线；
- 防止地面穿插、完全倒置和严重互相遮挡；
- 拖动过程消息 latest-wins，不累积无限队列；
- 松手后的最终变换必须可靠确认；
- 崩溃恢复最后一个已确认版本，而不是拖动中间帧；
- 世界原点重定位后卡片逻辑位置和保存偏移保持稳定；
- 所有位置、比例和旋转变化都必须连续，不瞬移。

### 12.3 可验收数值与输入状态

- 预设卡默认内容尺寸约 6.4m × 3.6m；统一比例允许 0.6–1.8；
- 默认中心高度 6–10m，用户调整后安全高度为 5.5–14m；
- 与人物水平交互距离限制为 3–30m；主拖动使用通过抓取点的相机朝向工作平面；`Alt+滚轮` 调整深度，普通滚轮只调比例；
- FollowUser 保存 yaw 偏移默认 ±60°，pitch 安全范围 25–65°；Pinned 框架仍执行内容 gimbal 可读规则；
- 重生点、出口、主路线和人物周围至少留 2.5m 安全半径；卡片可读内容投影重叠超过 35% 时显示警告并阻止最终提交；
- 聚焦目标落在人物前方约 8–12m 的中心观看锚点，目标比例为原布局的 1.35–1.6 倍；
- 每个布局保留最近 50 次已确认变换用于撤销/重做。

拖动枪输入状态为 `Holstered → Aiming → Selected → Dragging`。只有 `Selected/Dragging` 时 `Q/E` 被工具消费为旋转，此时不触发世界交互；取消或收枪后 `E` 恢复上下文交互。所有状态转换必须有明确视觉反馈。

## 13. 播放器与空间音频

### 13.1 播放器所有权

主 WebView2 内现有 HTML `<audio>` 是歌曲源、解码器和媒体时钟。Java 服务负责解析音源和状态镜像；Web Audio/AudioWorklet 可把同一 PCM 送到现有 JNI/XAudio2/OBR 管线。

仓库依据：主音频元素位于 `web/index.html:3081`，实际 `src/play()` 在 `web/app.js:37640` 附近，底层姿态入口位于 `native/windows/audio/fe_audio_pipeline.h:220`。这些依据描述当前事实，不表示 UE 姿态桥已经完成。

因此：

- 进入遇E不导航、不销毁、不重建、不暂停主 WebView2；
- 不把 `webView.Visible` 设置为 `false`，只由 UE 视觉覆盖；
- 覆盖期间暂停不必要的网页 3D/装饰循环，但保持音频和命令总线活动；
- UE 不能直接调用只改变 Java 镜像状态的接口来替代主 WebView 命令；
- 本地 Blob URL 不离开主 WebView 作用域；
- UE 崩溃、退出或重启不得重建歌曲或 seek。

任意稳态时必须恰有一个可听输出 sink：

- `BrowserDry`：浏览器/Web Audio 干声为唯一可听输出；
- `TransitionToNative`：原生链预滚并确认连续 PCM 后，以有界常功率斜坡把 dry 降至 0、native 升至 1；
- `NativeSpatial`：浏览器 dry gain 为 0，XAudio2/OBR 为唯一可听输出；
- `TransitionToDry`：原生异常或退出场景时先恢复同步 dry，再把 native 降至 0；
- 转换窗口允许同步交叉淡化，但不得形成可察觉双声、梳状滤波、响度翻倍或静音空洞；HTML `<audio>` 不得绕过受控 Web Audio 图直接另行输出。

### 13.2 命令和状态

```text
UE 空间控件
  → 命名管道
  → WinForms
  → WebView2 PostWebMessageAsJson
  → 现有 FeMonsterAppCommands
  → HTMLAudio / Web Audio / XAudio2
```

- 播放、暂停、切歌、seek、音量和歌单播放都发送意图并等待权威回执；
- 换歌、暂停和歌单变化立即推送给 UE；
- 播放中每秒发送 2 个包含单调时钟锚点的状态；
- UE 只在本地外推进度条和动画，不成为播放时钟；
- 所有命令使用 `commandId` 去重。

### 13.3 音乐区空间化

- 主歌曲声源固定在音乐区逻辑原点；
- 听者位置取人物头部，朝向取当前活动相机；
- 第一/第三人称切换时朝向平滑混合，听者位置不跳到第三人称镜头；
- UE 最多 30Hz 发送位置、前向、上向、区域混合、遮挡和混响发送量；音频块内继续插值；
- 现有 C 层 `fe_audio_pipeline_set_pose` 只是底层能力，目前没有 UE → WinForms → WebView → Java/JNI 的完整生产链；实施必须新增版本化 scene-pose API，不能把底层函数存在当作功能已完成；
- 完整链固定为 `UE SpatialPose → WinForms校验/合并 → 主WebView播放器桥 → session/generation/capability保护的本地音频API → NativeAudioEngine/JNI → fe_audio_pipeline_set_pose`；
- UE 轴为 X前/Y右/Z上，音频轴固定为 X右/Y上/Z前，转换为 `audio=(UE.Y, UE.Z, UE.X)` 并用左右/前后/上下测试锁定；
- 无限世界不向 float 音频接口发送绝对 LWC 坐标，而发送音乐区声源相对听者的米制向量；远场钳制并切换扩散模式；
- 新姿态 API 带 struct size/ABI version、当前音频 session/generation 和随机 capability，不复用只检查静态 header 的旧控制路径；
- 遮挡、混响和区域混合限制在 0–1，并使用参数斜坡；
- 音乐禁用多普勒：不请求歌曲 Doppler 或强制最终 frequency ratio 恒为 1.0，跑动、攀爬和滑翔不能改变歌曲音高；
- 音乐区近场保持明确三维定位；离开后逐渐加入方向、空气吸收和环境声；
- 远距离过渡为较低电平的扩散天空声场，不把歌曲衰减到完全听不见；
- 音频谜题同时提供视觉、字幕或震动辅助，启用辅助不阻止正常通关；
- 超过约 250ms 没有新姿态时先保持并衰减运动；IPC 中断后约 200ms 内常功率平滑退回安全中性/普通立体声，歌曲继续播放；
- Gate 0 和 Gate 3 必须确认 UE 没有主歌曲 Audio Component，只允许环境、脚步和 UI 音效。

## 14. Windows 宿主与窗口

### 14.1 新宿主类

新增 `UnrealWorldHost : IDisposable`，负责生成会话和管道、启动/监控 `runtime/yue-e/YueEWorld.exe`、Job Object、UE HWND、内容区定位、WebView2 转发、心跳、崩溃、日志和恢复。

- 使用安全参数 API（如 `ProcessStartInfo.ArgumentList` 或等价 CreateProcess 参数数组），不拼接可注入命令行；
- 启动前验证 exe 位于安装目录且 build ID、签名/manifest 哈希匹配；
- 创建进程后先加入带 `KILL_ON_JOB_CLOSE` 的 Job Object，再允许其完整运行，避免孤儿进程竞态；
- 只接受属于本次 UE PID 的 HWND；

现有 `DesktopSceneHost` 是 WorkerW 桌面壁纸窗口，带 `WS_EX_TRANSPARENT`、`WS_EX_NOACTIVATE` 和 `SetParent`，必须保持原职责，不作为遇E基础。

### 14.2 UE 窗口

- 独立无边框 `WS_POPUP` 顶层窗口；
- 使用 owner 关系跟随主窗口，不跨进程 `SetParent`；
- `WS_EX_TOOLWINDOW` 隐藏任务栏入口；
- 不设置全局 TopMost，只保持在自己的主窗口上方；
- 需要激活和接收键鼠，不使用 `WS_EX_NOACTIVATE`；
- WinForms 使用 `GetClientRect + ClientToScreen` 获取物理像素内容矩形；
- 主窗口移动、resize、DPI、全屏、显隐和最小化时合并更新，最多每帧应用一次；
- `Alt+F4` 和 UE `WM_CLOSE` 只请求退出遇E，由宿主完成退场。
- UE 覆盖后仍必须保留或转发主窗现有无边框 resize 边缘行为。

### 14.3 平滑进入与退出

```text
Idle → Starting → Handshaking → Warming → ReadyHidden
  → Web 云雾遮罩不透明 → Revealing
  → 显示带同款云雾的 UE 窗口
  → UE 约 900ms 散雾 → Active
  → Covering → Exiting → Idle
  ↘ Recovering / Faulted
```

每次进入生成新的 `sessionId + generation + activationRequestId`；连点进入、进入途中退出和重复退出均幂等，旧启动结果和旧窗口全部失效。UE 在不可见但非最小化状态预热，`frame.safe` 必须代表成功 Present 且帧健康，不只是 game tick。

预热期间原界面保持可见和可用。底层 WebView 在 UE 活动期间维持不透明云雾保险层；即使 UE 窗口突然消失，也不会直接闪回复杂网页画面。进入场景会暂停沙盒/DIY/网页装饰 RAF，但不暂停播放器；桌面壁纸、桌宠和录制工具栏保留各自宿主职责，新消息不得复用 `fe-desktop-scene`。

正常退出反向执行：`scene.prepareExit → 冻结UE输入并可靠保存 → UE升雾 → exitReady → 隐藏UE → Web退雾 → shutdown`。最多等待 3 秒让 UE 刷新状态和日志；超时后只终止 UE Job Object。退出后焦点返回原 WebView2 控件或“场景”按钮。

## 15. IPC、安全与一致性

### 15.1 命名管道

- 名称：`fe-monster.yuee.<128-bit-random-session-id>`；
- 单实例、双向、异步、字节模式；
- 4 字节小端长度前缀 + UTF-8 JSON；
- 单包硬上限 1MiB；
- 禁止 handle 继承；
- DACL 只允许当前登录会话 Logon SID，显式拒绝网络访问；
- 连接后验证客户端 PID、可执行路径和 HWND 所属进程必须等于本次启动的 UE；UE 反向验证宿主 PID；
- 音乐 PCM 和媒体 URL 不经过管道。

### 15.2 消息信封

```json
{
  "protocol": "yuee.ipc",
  "major": 1,
  "minor": 0,
  "sessionId": "opaque",
  "generation": 1,
  "seq": 42,
  "type": "playback.command",
  "commandId": "opaque",
  "replyTo": null,
  "revision": 18,
  "payload": {}
}
```

- 握手包含 major/minor、session、generation、hostPid、uePid、buildId 和 capabilities；major 不兼容时拒绝进入，minor 只启用双方能力交集；
- generation 变化后丢弃旧进程迟到消息；
- 修改型消息带 `commandId + expectedRevision`，重复命令幂等；
- 播放状态使用显式 `setPlaying(true/false)`，不使用含义不稳定的 `toggle`；超时重试复用同一 commandId；
- 生命周期、最终拖动提交和退出消息可靠确认；
- `spatial.pose` 和拖动预览只保留最新值；
- 队列有界并按生命周期/控制/状态/遥测优先级调度；大歌单分页/虚拟化，不在一条消息中发送完整媒体库或 base64 封面；
- 未知类型、旧 generation、倒退 seq、过深 JSON、超长字符串/数组和非有限数一律拒绝；错误回包只含机器码、可重试标志和清洗后的说明。

核心消息：`hello/helloAck`、`load.progress`、`frame.safe`、`heartbeat/heartbeatAck`、`window.bounds`、`playback.snapshot/command/ack`、`spatial.pose/status`、`component.transform.preview/commit/ack`、`scene.prepareExit/exitReady/shutdown` 和 `fatal`。

### 15.3 心跳

- 双向每 500ms 心跳；
- 管道 EOF 或 UE `Process.Exited` 立即恢复；
- 超过 2 秒未收到有效 UE 心跳，宿主先恢复主界面再关闭故障 UE；
- UE 超过 5 秒收不到宿主心跳时请求自退出；
- 一次进入最多自动重启一次，再次失败停留主界面。

### 15.4 WebView2 与场景组件安全

- 新 `fe-yue-e-*` 消息只接受主 WebView2 的已批准本地 origin；验证 `WebMessageReceived.Source`、导航 ready 状态和 JSON schema；
- 遇E消息解析失败不得退回宽松字符串窗口命令；
- 场景 Web Browser 只允许专用 localhost 组件路由，禁止远程导航、下载、弹窗、任意 JS 命令和凭据读取；
- 生产版关闭不需要的 DevTools、默认菜单和状态栏；
- 主播放器状态是场景面板只读快照，面板必须等权威命令结果后再确认状态。

## 16. 非战斗探索与成就

核心循环：

```text
远景吸引 → 自由选路 → 移动挑战 → 理解环境 → 抵达奇观 → 成就记录
```

首版内容包括光点收集、记忆回声、远古钟、光路与星座谜题、风道滑翔、隐藏攀爬路线、洞穴、浮岛和景观制高点。坠落由光流托起或返回最近安全点，不造成伤害。

首发成就目录锁定为以下 6 项，取代旧规格的 10 项目录：

| 名称 | 稳定 ID | 触发方向 |
| --- | --- | --- |
| 初次登顶 | `yue-e-first-summit` | 首次抵达批准制高点 |
| 穿云者 | `yue-e-cloudwalker` | 完成连续云海滑翔路线 |
| 远方回声 | `yue-e-distant-echo` | 唤醒全部首发记忆回声类型 |
| 遗迹聆听者 | `yue-e-ruin-listener` | 完成首个远古钟/回声谜题链 |
| 万米旅人 | `yue-e-ten-kilometer-traveler` | 累计有效非传送路径 10,000m |
| 归音之路 | `yue-e-path-home` | 从外围通过归音光门平滑返回音乐区 |

成就只向现有系统发送白名单、稳定 ID、单调进度和可去重 `eventId`；不建立第二套成就存储，不撤销旧成就。辅助功能不能永久阻止通关或普通探索成就。

### 16.1 探索实例状态契约

- 每个可交互探索对象使用 `instanceId = hash(worldVersion, tileX, tileY, archetypeId, localStableIndex)`；PCG 重建、区块池化和原点重定位不得改变该 ID；
- 光点属于会话内可重复氛围收集物：同一 `sceneSessionId` 内收集后在区块卸载、回收和崩溃恢复时保持已收集，正常退出后新会话可按确定性布局重生；它不发永久奖励或成就事件；
- 记忆回声、远古钟、首发谜题链、已发现地标和隐藏路线属于跨会话持久对象，状态只允许 `undiscovered → activated → completed` 单调前进；已完成对象重建后呈现完成态，不重复首通奖励；
- 风道、环境机关和普通移动挑战每次区块激活可复位其运行时动画，但必须读取关联持久对象的完成态；复玩可保留反馈，不重复推进同一成就里程碑；
- UE 发送的状态变更包含 `instanceId`、`fromRevision`、目标状态和稳定 `eventId = hash(instanceId, transition, contentRevision)`；宿主以比较并交换方式原子提交，重复、乱序或旧 generation 事件只能返回当前权威状态，不能再次奖励；
- 主机保存跨会话稀疏状态表和当前会话临时收集集；临时集随崩溃恢复快照保留，正常结束会话后清除。区块进入 `ready-hidden` 前必须拿到对应状态快照，不能先显示错误状态再跳变。

## 17. 状态与持久化

### 17.1 宿主权威数据

- 空间组件稳定 ID、位置、旋转模式、用户偏移、统一比例和版本；
- 人物外观模块选择；
- 相机模式和可访问性设置；
- 已发现地域、地标和成就进度；
- 跨会话探索实例的单调状态、状态 revision 和已处理里程碑事件；
- 当前场景会话的临时光点收集集及其恢复期限；
- 最近安全点的短期恢复数据；
- 最后一次 UE 会话诊断信息。

歌曲、歌单、音量和播放进度继续由现有播放器保存，不进入遇E场景存档。

### 17.2 保存规则

- 拖动预览不落盘，松手确认后原子保存；
- 使用临时文件 + 替换或现有等价原子存储机制；
- 保存逻辑坐标，不保存原点重定位后的临时局部坐标；
- 数据带 schema version 和显式迁移函数；
- 损坏时只重置遇E状态，不影响账号、歌单或播放器；
- 正常重新进入默认出生在音乐区，不是上次离线位置；
- 同一运行时短暂崩溃恢复可以使用最近安全点，超时或区块未就绪则回音乐区。

## 18. 故障处理

- **UE 可执行文件缺失、签名/清单错误或版本不符**：不离开原界面，不影响歌曲。
- **启动超时或握手失败**：关闭子进程、恢复按钮并允许手动重试。
- **DX12/Lumen/显卡能力不足**：显示明确原因；不得偷偷回退旧 Three.js 场景冒充遇E。
- **核心角色或音乐区失败**：不进入场景，不用低质量替代物冒充完成。
- **外围区块失败**：保持云雾和连续安全地形，后台重试，不生成空气墙。
- **预设 Capture 失败**：保留最后合法帧并显示克制加载状态，恢复后平滑切换。
- **UE Web Browser 组件失败**：只降级对应 UI，主播放器继续播放。
- **UE 崩溃、设备丢失或断管道**：底层云雾保险层接管，主界面平滑恢复，歌曲不停；同一次进入只允许一次受控 UE 恢复。
- **空间音频姿态中断**：约 200ms 常功率交叉回中性声场，不 pause、seek 或换歌。
- **WebView2 GPU 子进程失败**：沿用现有可恢复路径并记录诊断。
- **音频所有者 WebView2 本身崩溃**：使当前 UE generation 失效并走现有播放器恢复；不得声称浏览器音频所有者彻底崩溃仍绝对无间隙。
- **持久化失败**：保留上次合法文件并将布局回默认，不影响播放器数据。
- **主应用退出**：先拒绝新 UE 命令，短暂优雅 shutdown；Job Object 使用 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` 回收残留进程。
- **日志**：使用 session/request 关联，脱敏媒体 URL、账号、token、本地路径和异常栈。

## 19. 性能与清晰度预算

Windows 主验收参考环境：Windows 11、1920×1080、60Hz、16GB RAM、Intel i5-12400 / Ryzen 5 5600 级 CPU、RTX 3060 / RX 6600 6GB 或更高。报告同时记录 GPU 驱动、电源模式和显示器刷新率。

硬指标：

- 原生 1920×1080、100% 渲染比例、动态分辨率关闭；
- 目标 60 FPS；P95 帧时间不超过 16.7ms；1% Low 不低于 50 FPS；
- 运行中任何超过 50ms 的卡顿视为失败，不能用平均帧率掩盖；
- 接触期足部可见滑动不超过 2cm；
- 连续 3 个成功 Present 且帧健康的安全帧后才允许揭示画面；
- 首次动作、首次 UI、首次预设聚焦和首次跨区不得出现 shader/PSO 编译卡顿；
- 不出现近景纹理占位、首帧错误姿势、空白 RenderTarget、LOD 单帧跳变或整块地形 pop-in；
- 音频控制与视觉状态响应目标不超过 100ms；
- 强杀 UE 后主界面目标在 250ms 内重新可见；
- 连续进入/退出 20 次无孤儿进程、无音频重播、无持续内存单调增长；
- 30 分钟无边界探索、32m/s 高速前进、180° 急转和多次原点重定位无边界、接缝、错位或加载停顿；
- DPI 100%、125%、150% 和跨屏移动无错位、模糊或黑边。

每个性能报告必须包含 Game Thread、Render Thread、GPU、SceneCapture、RAM、VRAM、区块流送和音频状态。Unreal Insights 测量与录屏分开执行，提交原始 `.utrace` 和汇总，避免录屏开销污染指标。

性能不足时的降级顺序：远景阴影 → 体积采样 → 反射 → 植被密度 → 远景 HLOD 精度。人物、焦点 UI、歌单文字和交互碰撞不能先降级。

## 20. 输入与可访问性

| 输入 | 行为 |
| --- | --- |
| `W/A/S/D` | 相对相机移动；攀爬时沿表面移动 |
| `Shift` | 跑动 |
| `Space` | 跳跃；空中展开透明分段翼滑翔 |
| `Ctrl` | 滑翔下降或攀爬放手 |
| `E` | 上下文交互 |
| `V` | 第一/第三人称切换 |
| `G` | 装备/收起拖动枪 |
| `Q/E` | 拖动枪已有选中目标时逆/顺时针旋转；非拖动态的 `E` 仍为交互 |
| 鼠标左键 | 选择和拖动 |
| 滚轮 | 选中组件统一缩放 |
| 长按 `T` | 通过光效返回音乐区 |
| `Esc` | 取消拖动、关闭焦点面板或退出鼠标捕获 |

- 所有输入允许重映射并检测冲突；
- FOV、灵敏度、反转、镜头晃动、辉光和空间音频距离感可调；
- 交互反馈同时提供视觉和非刺耳声音，不只依赖颜色；
- 音频谜题提供字幕、可视波纹和可选震动；
- 低性能模式不能移除玩法、碰撞、歌单或成就功能。

## 21. 测试策略

### 21.1 Blender/资产验证

- 单位、轴向、应用 transform、骨骼命名、权重数量和负缩放；
- UV、法线、LOD、碰撞和 socket 完整性；
- FBX 不包含材质、纹理或动画；
- 自动导入后比较 bounds、骨骼姿态和模块拼缝；
- 资产清单验证原创来源和许可，不允许提取游戏资产。

### 21.2 Unreal 自动化

- 运动状态、相机混合、IK 接触、攀爬合法性和安全回退；
- 组件变换约束、撤销/重做、复位和存档迁移；
- PCG 种子、区块稳定 ID、边缘采样、回收和原点重定位；
- 音乐区重生、归音光门和空间姿态单位/轴向转换；
- 自动截图比较材质、UI 清晰度、雾和主要光照；
- Content Stress 加载全部地图、角色、材质、动画和预设。

### 21.3 宿主、IPC 与音频

- 进入/退出 20 次，确认同一个主 `#audio`、曲目、src、queue revision 和媒体时钟持续；
- 预热、活动、退出、强杀 UE、断 pipe 和自动恢复期间检查无第二音频、无重复 `play()`/src 写入；
- 使用系统 loopback 捕获验证 BrowserDry/NativeSpatial 稳态只有一个可听 sink，转换期间无双声、响度翻倍或静音空洞；
- 伪造客户端、错误 PID/SID、旧 generation、倒退 seq、超大/截断消息、NaN、重复命令和未知类型全部被拒绝；
- 30Hz 姿态洪泛不能饿死退出和播放命令；
- 左右、前后、上下、第一/第三人称、离开/返回音乐区的声像测试；
- 断言音乐频率比保持 1.0，多普勒禁用；
- 位置/尺寸、焦点、DPI、多显示器、Alt-Tab、Win+D、睡眠恢复和显示器热插拔；
- 窗口必须是非 child、未调用 `SetParent`、任务栏隐藏、可激活、无鼠标穿透且 HWND 属于本次 UE PID；
- UE 崩溃恢复后无残留进程、pipe、窗口、句柄、计时器或旧命令。

### 21.4 真实三维与清晰度证明

验收录像必须展示：

- 自由环绕、近远移动、俯仰和穿行产生真实视差；
- 角色线框/骨骼调试视图以及动态光源下的自遮挡和投影；
- 地形、遗迹和植物具有几何厚度、碰撞与法线响应；
- 玻璃框架有真实厚度，只有其中 UI 内容允许来自 Widget/Browser 纹理；
- 预设动态对象持续变化，证明来自 SceneCapture；
- 八个水平观察方向以及上/下视角检查，背面文字不镜像；
- 100%、125%、150% DPI 下文字、准星、卡边和人物轮廓清晰。

### 21.5 框架和发布测试

- UE Automation Test Framework：单元、功能、内容压力和截图比较；
- Gauntlet：宿主与 UE 多进程冒烟、崩溃和长时间运行；
- 现有 Java、WebView2、播放器和原生音频探针继续作为回归；
- PSO 自动预缓存结合必要 bundled cache；
- 干净机安装、升级、卸载、文件篡改检查和无后台残留。

## 22. 强制验收门

### 22.1 通用规则

- Gate 严格按 `0 → 8` 执行，状态为 `pending / in_progress / in_review / approved / rejected / invalidated`；
- 当前 Gate 完成后立即停止，只展示、测试和修正当前 Gate；用户明确批准前不得开始下一 Gate；
- 本次设计对话中的“可以”不等于未来运行产物已验收；
- rejected 后只修改当前 Gate，并重新生成完整证据；
- approved 绑定该 Gate 的“受保护组件/资产 manifest”和对应 SHA-256，不绑定整个累计安装包；后续 build ID 或无关文件变化不会自动失效；
- 后续工作修改某个已批准 Gate 的受保护输出哈希时，该 Gate 变为 `invalidated`；`invalidated` 的前置 Gate 是“只修当前 Gate”规则的唯一例外，必须先暂停新 Gate、把受影响前置 Gate 作为当前修复范围，完成修复、完整复验并重新生成证据；前置 Gate 恢复到 `in_review` 后，才可与新 Gate 在同一次验收中向用户展示并分别重新批准；任一前置 Gate 未重新 `approved` 时，新 Gate 不得获批或继续下一 Gate；
- 仅测试、文档或构建元数据变化且受保护输出哈希不变时无需重新人工批准，但必须重跑自动回归；
- Gate 8 对最终累计安装包做最后一次整体用户批准，解决集成构建与历史 Gate 的闭环；
- 静态图只辅助观察，不能替代可自由控制镜头的 Windows 真实 3D 包。

每门通用交付：

- `YueE-G<n>-<buildId>` 可运行 Windows 包；
- 1920×1080、60FPS、无跳剪操作录像；
- 自动测试原始输出与汇总；
- Unreal Insights `.utrace`、CPU/GPU/内存统计；
- Git 提交、UE/Blender 版本和资产/构建哈希 manifest；
- 当前问题清单和用户验收记录。

Gate 专属证据按本节各 Gate 出口条件追加。角色/模型 Gate 提供 4K 正侧背与 FBX 导入设置；窗口 Gate 提供多 DPI/进出画面；无资产导入的 Gate 可将 FBX 项标为 `N/A`，但必须写明原因，不能伪造不适用证据。

### Gate 0：工程与进入场景链路

- 建立 Blender 5.2 LTS、UE 5.8、Win64 DX12 可复现工程；
- 沙盒模式旁新增“场景”按钮和独立 `fe-yue-e-*` 消息族；
- 完成 `UnrealWorldHost`、管道、Job Object、owned top-level 窗口和云雾交接；
- 连续 3 个成功 Present 的安全帧后才显示；
- 连续进出 20 次、强杀 UE、断管道、移动、缩放、最小化和混合 DPI 全部恢复；
- 主 WebView2 只被视觉覆盖，同一歌曲时钟连续且无残留进程。
- 冻结已跟踪的 `CharacterMaster-01`、`CharacterMotionReference-01` 和 `CameraCompositionReference-01`，逐一验证路径、尺寸、Git blob 和 SHA-256；同时归档 `WorldMapReference-01`、`SceneUIManifest-v1` 和 `PresetManifest-v1` 的稳定 ID、可读取位置与哈希，作为后续 Gate 可复现验收基线；任一正式母版字节缺失或哈希不符时 Gate 0 阻塞。

### Gate 1：人物立体造型

- 完成唯一默认角色的原创 Blender 模型、骨骼、蒙皮、UV、LOD、碰撞和 sockets；
- FBX 无动画、无最终材质/贴图，UE 三个对应导入选项关闭；
- UE 完成面罩光眼、角色材质、胸口光核、腕环、六片透明分段翼和灯光转台；
- 正侧背 360° 可见体积、自遮挡、动态阴影和材质响应；
- 外形未批准不进入 Gate 2。

### Gate 2：丝滑动作系统

- 完成待机、八向走跑、冲刺、急停转身、跳跃落地、坡面、攀爬、抓边、翻越、滑翔和安全坠落；
- 第一/第三人称约 0.45s 连续混合；
- Control Rig、AnimBP、Motion Matching、FBIK、Inertialization、Motion Warping 和限定 Root Motion 实际接入；
- 正常速度与慢放均无硬切、关节 pop、镜头抽动、穿模和首用卡顿，足滑不超过 2cm。

### Gate 3：音乐区实体场景

- 将已批准地图中的音乐区制作成可环绕、可进入、可攀爬的真实三维环境；
- 完成固定重生、音频中心、UI 锚点、Lumen、阴影、天空、体积雾和材质；
- 验证不同方向的视差、碰撞、遮挡和声源方向；
- 世界名为遇E，音乐区仅为固定局部区域，歌曲时钟仍只属于原播放器。

### Gate 4：空间 UI 与拖动枪垂直切片

- 三个实时预设卡片和一个真实歌单面板；
- 6–10m 高、大尺寸、约 45° 向下、硬玻璃真实厚度、双面正确和 hover 柔光；
- 对完整 `MusicZoneReadableVolume` 做连续 360° 路径和合法高低视角自动扫测，所有位置满足法线、投影宽度和最小像素规则；实时 SceneCapture 持续变化；
- 聚焦只隐藏其他预设，目标平滑居中放大；
- 拖动枪完成移动、滚轮统一缩放、旋转、撤销、重做、复位和保存，只命中空间 UI。

### Gate 5：完整音乐区 UI

- 接入全部现有预设、歌单、播放、搜索、设置、成就和功能按钮；
- 全部 Actor 有稳定 ID、生命周期、错误态和跨会话布局；
- 场景歌单保持原 HTML/CSS 视觉和功能，但不创建第二播放器；
- UI 打开、关闭、重排、缩放和 RenderTarget 升级均无突然出现。

### Gate 6：无边界外围世界

- Blender 原创地形、岛屿、岩石、遗迹和植物模块；
- World Partition、PCG、HLOD、LWC、256m 区块、逻辑坐标和受控原点重定位实际运行；
- 六域、大片留白、稳定种子、共享边缘和资源池完成；
- 连续 30 分钟、32m/s 高速、180° 急转和多次重定位无边界、接缝、重复错位、回弹、强传送和未遮蔽 pop-in；
- 归音光门先预热后平滑返回固定音乐区。

### Gate 7：非战斗冒险与成就

- 光点、记忆回声、古钟、光路/星座谜题、风道、洞穴、浮岛、攀爬路线和制高点可完整游玩；
- 6 项首发成就触发、去重、保存和恢复通过；
- 对光点、记忆回声、远古钟和谜题执行区块卸载/重载、池化复用、进程崩溃恢复与跨会话重进测试；实例 ID、会话内/跨会话状态和奖励去重全部符合 16.1；
- 自动审计不存在敌人、武器、攻击、伤害、血量或战斗奖励；
- 坠落无伤，歌曲和进度不丢失。

### Gate 8：Windows 最终质量与发布

- 全量 PSO、材质、纹理、动画和首屏 RenderTarget 预热；
- Gate 0–7 全部回归重新通过；
- 原生 1080p/100%、无动态分辨率、无胶片颗粒、色差、像素噪点、编译卡顿和纹理/LOD 突现；
- Windows 干净安装、升级、卸载、完整性、崩溃日志、签名/manifest 和 Job Object 回收通过；
- 最终安装包资产哈希对应最后一次获批产物。

Windows Gate 8 通过后，再分别制定 macOS、Android 和 iOS 适配规格。移动端限制不能反向降低 Windows 画质和交互目标。

## 23. 完成定义

只有以下条件全部成立，遇E Windows 首版才算完成：

- Gate 0–8 按顺序获得用户对实际运行产物的明确批准；
- 可从沙盒模式旁进入和退出遇E，主歌曲不重播、不跳进度；
- 世界名始终为“遇E”，音乐区明确是固定局部区域、默认重生点和主歌曲声源；
- 人物符合唯一批准母版并是原创真实骨骼三维模型；
- 走、跑、跳、滑翔、攀爬、翻越和镜头切换连续流畅；
- UI 高空、巨大、约 45° 俯视、双面正确且批准观察点清晰；
- UI 在整个 `MusicZoneReadableVolume` 的所有合法可达位置连续可读，不以少量抽查点代替；
- 预设实时播放，聚焦时其他预设平滑隐藏，目标平滑居中放大；
- 现有歌单保持视觉与功能，只有主 WebView2 一个音乐播放器；
- 拖动枪能安全移动、缩放、旋转、撤销、重做、复位和保存空间组件；
- 世界无可见边界，保留大量留白且无生成接缝或 pop-in；
- 外围只有原创非战斗探索、环境谜题和成就；
- 原生 1080p 清晰，无像素颗粒、黑帧、突然出现和超过 50ms 卡顿；
- 参考环境达到 60FPS、P95 与 1% Low 指标；
- UE 崩溃、断管道或退出不打断主播放器，并能平滑恢复原界面；
- 最终安装包可在参考 Windows 机器干净安装并复现验收，字节与已批准资产血缘一致。

## 24. 官方技术依据

- [Unreal Engine 5.8](https://www.unrealengine.com/news/unreal-engine-5-8-is-now-available)
- [Blender LTS](https://www.blender.org/download/lts/)
- [UE FBX Skeletal Mesh Pipeline](https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-skeletal-mesh-pipeline-in-unreal-engine)
- [UE FBX Import Options](https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-import-options-reference-in-unreal-engine)
- [Lumen](https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-global-illumination-and-reflections-in-unreal-engine)
- [Control Rig](https://dev.epicgames.com/documentation/unreal-engine/control-rig-in-unreal-engine)
- [Motion Matching](https://dev.epicgames.com/documentation/unreal-engine/motion-matching-in-unreal-engine?lang=en-US)
- [Widget Components](https://dev.epicgames.com/documentation/unreal-engine/widget-components-in-unreal-engine?lang=en-US)
- [Web Browser Widget](https://dev.epicgames.com/documentation/unreal-engine/API/PluginIndex/WebBrowserWidget)
- [World Partition](https://dev.epicgames.com/documentation/unreal-engine/world-partition-in-unreal-engine?lang=en-US)
- [World Partition HLOD](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition---hierarchical-level-of-detail-in-unreal-engine)
- [Large World Coordinates](https://dev.epicgames.com/documentation/unreal-engine/large-world-coordinates-in-unreal-engine-5)
- [PCG Framework](https://dev.epicgames.com/documentation/unreal-engine/procedural-content-generation-framework-in-unreal-engine?application_version=5.8)
- [PSO Precaching](https://dev.epicgames.com/documentation/unreal-engine/pso-precaching-for-unreal-engine?lang=en-US)
- [Automation Test Framework](https://dev.epicgames.com/documentation/en-us/unreal-engine/automation-test-framework-in-unreal-engine)
- [Gauntlet](https://dev.epicgames.com/documentation/unreal-engine/gauntlet-automation-framework-in-unreal-engine?lang=en-US)
- [Named Pipe Security](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)
- [WebView2 Security](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security)
- [X3DAudio + XAudio2](https://learn.microsoft.com/en-us/windows/win32/xaudio2/how-to--integrate-x3daudio-with-xaudio2)
- [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)

## 25. 书面批准后的下一步

本文通过书面复核后，才调用实施计划流程重写 UE 路线计划。以下未跟踪的 Three.js 计划均为失效草案，不得执行或部分复用命令：

- `2026-08-21-yue-e-phase-1-character-runtime-shell.md`
- `2026-08-22-yue-e-phase-1a-character-gate.md`
- `2026-08-22-yue-e-phase-1b-runtime-shell.md`
- `2026-08-22-yue-e-phase-1c-app-integration-release.md`

新计划必须从 Gate 0 开始，并继续执行“每完成一门先向用户展示验收”的硬性顺序。
