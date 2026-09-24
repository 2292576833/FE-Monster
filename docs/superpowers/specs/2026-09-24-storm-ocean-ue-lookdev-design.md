# 风暴海域 UE5 Lookdev 设计

## 目标

把现有“无尽风暴海域”预设搬入独立的 Unreal Engine 5.8.2 预览场景，在 UE 中重新完成材质、光照和风暴效果，同时保留主 Web/Three.js 预设作为播放器当前实现，不修改 Gate01、Gate02 或 MusicZone 地图。

## 已确认的源资产

- 预设描述：`web/data/storm-ocean-preset.json`，稳定 ID 为 `preset-storm-ocean-horizon`。
- 海面模型：`web/bundled-assets/1dec0986-a81d-4847-af22-93d1976b5f2d/blender-output/storm-ocean-horizon.glb`。
- 海盗船模型：同目录的 `pirate-ship-storm.glb`。
- 风暴水面纹理：`web/assets/storm-ocean/water-normal-spectral-4k.png`、`water-roughness-spectral-4k.png`。
- Cycles 参考环境：`web/assets/cycles/storm-ocean/storm-ocean-cycles-environment.png` 和 `cycles-source/storm-ocean/storm-ocean-cycles-environment.blend`。
- UE 工程：`E:/FE moster-yue-e-g0/unreal/YueEWorld/YueEWorld.uproject`，当前实际版本为 UE 5.8.2 / CL 56702186。

GLB 作为几何来源保留其节点和材质语义，但 UE 导入沿用当前工程的 Blender → FBX 管线；Blender 只负责规范化几何和导出无材质交换文件，最终材质、灯光、动画、Niagara 和渲染均由 UE 生成。

## 场景边界

新增独立内容目录 `Content/YueE/StormOcean/` 与地图 `L_YueE_StormOceanReview`。导入脚本必须幂等、只写该目录及明确的临时导入目录，不得保存或覆盖 Gate0/Gate01/Gate02/MusicZone 地图。主应用仍使用 `FeStormOceanRuntime`，本轮不创建第二个播放器，也不要求主应用立刻切换到 UE 画面。

## UE Lookdev

### 材质

- 水面使用双层滚动法线、Fresnel、深度吸收、粗糙度纹理、泡沫阈值和风暴强度参数；材质参数由实例暴露，便于日间、黄昏和雷暴三套 look 调整。
- 海盗船拆分为湿旧木、锈蚀铁件和旧帆布三个 UE 材质实例；保留现有 PBR 贴图语义，并加入湿润度、边缘高光和风暴冷色反射。
- 静态高面数网格在兼容时启用 Nanite；半透明或需要顶点位移的水体按 UE 5.8 的不透明/半透明限制选择合适路径，不能为了追求效果破坏深度和阴影。

### 光照和天空

- 使用 Sky Atmosphere、Volumetric Cloud、Exponential Height Fog、Directional Light、Sky Light、Lumen GI/Reflections 和 Virtual Shadow Maps。
- 建立 day、sunset、evening 三个可切换 look；雷暴期间降低环境曝光，加入冷色闪电主光和短暂海面反射脉冲。
- 关闭电影颗粒、色差和不受控动态分辨率，保持固定分辨率截图可比较。

### 风暴效果

- Niagara 雨线、近景雨滴、浪尖喷溅、泡沫碎屑和云内闪电分层实现。
- 先使用确定性的时间驱动和固定随机种子，保证自动化截图稳定；音乐低频驱动作为第二阶段接入现有 UE 会话桥，不把音频播放迁移到 UE。
- 船体随现有风浪谱做轻微升沉、俯仰和横摇，避免改变原预设空间关系。

## 导入和验证接口

- 新增 `unreal/YueEWorld/Scripts/import_storm_ocean.py`：预检源文件、导入 FBX、建立材质/材质实例、创建或更新预览地图、保存并重载校验。
- 新增 `unreal/YueEWorld/Scripts/validate_storm_ocean.py`：检查地图包、网格边界、材质连接、灯光组件、后处理和 Niagara 资产的稳定契约。
- 新增 Blender 侧规范化导出脚本或复用现有脚本入口，输出海面与船体的无材质 FBX，并写出源哈希、单位、轴向、边界和纹理映射报告。
- 新增聚焦的 Node/Python/UE Automation 检查；UE 编译、资源重载和固定视角截图必须在实际 UE 5.8.2 上执行。

## 验收标准

1. 预览地图可在 UE 5.8.2 DX12 下打开，首帧无缺失包、材质编译错误或地图加载错误。
2. 海面、海盗船和纹理资产均位于 `Content/YueE/StormOcean/`，重复运行导入脚本不会产生重复 Actor 或重复资产。
3. 水面能看到受 Fresnel、法线、粗糙度、泡沫和风暴强度控制的层次；船体能区分木、铁、帆布材质，并接受风暴光照。
4. day、sunset、evening 和雷暴 look 均可切换，雨、喷溅、雾和闪电效果在固定种子下可复现。
5. 现有 Gate01、Gate02、MusicZone 地图和主 Web/Three.js 风暴预设哈希不被修改。
6. 自动化报告明确区分已通过的 UE 预览与尚未完成的主客户端 UE 窗口/IPC 接入。

## 明确不在本轮

- 不把 UE 播放器接管主应用音频。
- 不把 UE 预览冒充为已完成的无边界世界、主客户端入口或跨会话布局持久化。
- 不重做整个海域的全新 Blender 几何；若现有 GLB 转换后存在不可接受的几何缺陷，再单独开建模迭代。
