# FE Monster 设置中心、音域回响交互与 Rust 调音台设计

日期：2026-08-20  
状态：已在对话中批准，等待书面复核

## 1. 目标

本设计一次性完成以下用户目标，同时保留现有播放器、参数状态和故障回退能力：

1. 修复文字预设参数进入页面后不显示或不可编辑的问题。
2. 删除旧顶部设置入口，将一个无可见容器的白色设置图标附着到新播放栏表面。
3. 将设置改造成居中的大圆角设置中心，左侧切换类别，右侧显示对应参数。
4. 去掉新播放栏工具按钮的可见容器，使按钮直接附着在播放栏表面，同时保留可访问命中区域。
5. 让可见场景与 UI 动画不受程序内固定 FPS 上限约束，并交由 Windows、WebView2 与显卡驱动管理 FreeSync / G-SYNC / 标准 VRR。
6. 完成音域回响的参数持久化、歌词手势、空白双击回正、自带播放栏拖动、进度控制与滚轮切歌。
7. 在现有原生音频链中接入 Rust 调音台，使处理顺序成为“上混 → 调音台 → OBR”。
8. 在设置中心提供完整调音参数与可听效果预设。

## 2. 非目标与真实性边界

- 网页和 WebView2 不能替显卡驱动强制打开 FreeSync 或 G-SYNC。本项目只移除自身固定帧率限制、使用显示器节拍驱动的 `requestAnimationFrame`，并显示“VRR 由驱动管理”。
- 音频采样、网络同步、状态采集和后台维护任务不是视觉动画，不会被提升到显示器刷新率。
- 不重写现有播放器，不建立第二套设置状态，不将调音台实现为 JavaScript 音频效果。
- 浏览器音频直放继续作为原生链不可用时的兼容回退；回退状态必须在调音台页面明确显示为“未进入原生调音链”。
- 不修改打包进来的 Wallpaper Engine 原作压缩资源；扩展全部位于受控桥和宿主运行时。

## 3. 方案选择

### 3.1 采用方案：复用状态、替换外壳、扩展现有 Rust DLL

- 现有表单、事件监听器和持久化函数继续作为参数权威。
- 新增窄接口的设置中心控制器，只管理页面切换、对话框生命周期和焦点，不拥有业务参数。
- 新播放栏保留现有命令与 DOM 语义，只改变入口位置和视觉容器。
- 音域回响使用现有 `fe-soundscape:v1` 通道扩展输入意图，不让沙盒直接调用播放器 API。
- Rust 上混 DLL以新增导出的方式增加 Mixer ABI；旧 Upmix ABI 保持兼容。

该方案改动范围可控，能复用已经通过测试的播放、命令、音域回响和 OBR 链路。

### 3.2 未采用：一次性重写播放栏、设置页和播放器

这会同时改变播放时钟、状态恢复、命令桥和音频所有权，回归面过大，且无法证明比现有系统更稳定。

### 3.3 未采用：独立 Mixer DLL 或 JavaScript 调音台

独立 DLL 会使部署、ABI、加载失败和探针数量翻倍；JavaScript 调音只覆盖浏览器路径，无法保证位于上混与 OBR 之间。两者都不符合统一音频链目标。

## 4. 中央设置中心

### 4.1 DOM 与兼容性

- 删除旧顶栏中的设置按钮位置。
- 新播放栏表面新增白色齿轮图标，继续使用兼容 ID `runtimeSettingsButton`，避免已有事件、命令和测试失效。
- `runtimeSettingsPanel` 从侧边面板升级为带 `role="dialog"`、`aria-modal="true"` 的中央设置中心；保留 ID 以兼容现有控制函数。
- 设置中心由三个区域组成：标题栏、左侧类别导航、右侧滚动内容。
- 左侧类别固定为：常规、画面与场景、歌词、桌宠、模型与 TTS、调音台、光标。
- 现有控件按类别迁移到对应页面；控件 ID、表单值、事件绑定和保存函数不改变。

### 4.2 控制器接口

新增 `web/settings-center.js`，仅暴露：

```js
window.FeSettingsCenter = {
  registerPage(descriptor),
  open(pageId),
  select(pageId),
  close(reason),
  snapshot()
};
```

控制器拥有：

- 对话框开闭状态；
- 当前页面；
- 焦点锁定、Esc 关闭和关闭后焦点恢复；
- 页面可见性与 ARIA 状态；
- 打开/关闭动画。

控制器不拥有 GPU、模型、TTS、歌词、光标或调音参数。页面注册时只传 DOM 节点与激活回调，避免形成平行状态。

### 4.3 视觉规范

- 中央窗口宽度使用 `min(1120px, calc(100vw - 48px))`，高度使用 `min(760px, calc(100vh - 48px))`。
- 圆角 28–32px；边界使用低透明度冷绿色细线。
- 背景由均匀的深墨绿到近黑线性渐变构成，最多叠加一层极弱径向高光；不使用大面积噪声、彩色雾或高不透明模糊层。
- 正文字体使用系统 UI 字体栈，禁止对文字层做 `scale()`；字体大小、行高和字重使用整数或稳定小数。
- 文本保持浏览器原生栅格化，使用当前 DPR/缩放清晰度链，不对缓存位图放大。
- 导航、表单和状态文本满足键盘访问与可读对比度。

## 5. 新播放栏工具

- `#qishuiPlaybackTools` 保留导航语义，但其背景、边框、阴影、底部托盘和可见容器全部移除。
- 场景、文字、壁纸、音游、歌单与设置入口直接显示为图标或简短标签。
- 每个交互项仍保留至少 40×40 CSS 像素的透明命中范围、焦点轮廓、`aria-pressed` 和 accessible name。
- 设置齿轮位于播放栏上缘，不增加新的底部容器。
- 现有 `handlePlaybackCardTool`、`openPlaybackDiyPanel`、`openPlaybackRhythmGame` 和命令目录继续作为行为入口。

## 6. 文字预设参数修复

文字参数 DOM 与持久化逻辑已经存在，故障来自恢复出的 `book` 状态在非书本场景中仍使编辑区域禁用，以及页面进入时未完整同步字体与控件。

进入文字页时必须按以下顺序执行：

1. 若当前场景不是书本场景而 `textPreset === 'book'`，恢复 `lastSelectableTextPreset`，无有效值时使用默认文字预设。
2. 初始化字体选项。
3. 同步文字模板、字体、调色板、翻译和动画控件。
4. 只在真实书本场景禁用不适用参数。
5. 完成页面切换后发布可观察的 ready 状态。

真实浏览器验收必须从新播放栏点击“文字”，不能只直调同步函数。

## 7. 音域回响状态与恢复

### 7.1 持久化模型

存储升级为版本化状态：

```json
{
  "version": 2,
  "requestedParameters": {},
  "effectiveParameters": {},
  "lastKnownSafeGridSize": 160,
  "controllerPosition": { "x": 2, "y": 3 },
  "updatedAt": 0
}
```

- 26 个普通参数在重启后原值恢复。
- `requestedParameters.gridSize` 永久保存用户选择，包括 640、1080、4096。
- 场景创建时先使用 `lastKnownSafeGridSize`，收到受信任的 runtime-ready、首帧心跳和健康诊断后再逐级恢复目标网格。
- 每次升级后观察有界时间窗；若画面无首帧、心跳中断、上下文丢失或帧耗时持续超预算，立即回退并记录可解释状态。
- UI 同时显示“已保存目标”和“当前生效值”，不能把安全回退伪装成参数丢失。

### 7.2 沙盒输入桥

扩展 `fe-soundscape:v1` 消息，新增 `gesture` 与 `player-intent`。每个消息必须：

- 来自当前 iframe 的 `contentWindow`；
- 携带当前实例 nonce；
- 字段经过白名单与范围验证；
- pointer move 合并到一次动画帧；
- 不包含路径、URL、HTML 或任意命令名称。

子场景只发送归一化意图，父页面仍是歌词变换、播放命令和持久化的唯一权威。

## 8. 音域回响交互

### 8.1 单排歌词

- 沙盒事件通过父运行时进入现有 `textPresetGesture` 状态机。
- 中部长期按下后拖动位置；左右控制区调节角度；滚轮保留缩放。
- 在音域回响场景中双击空白区域，将当前单排歌词的平移、旋转和缩放恢复默认并置于画面中心。
- 手势结束后使用现有文字变换持久化，不新增第二份歌词位置状态。

### 8.2 音域回响自带播放栏

- 子桥识别原作播放器区域，但不修改原作压缩脚本。
- 在非按钮、非滑块的空白区域按住 360ms 后进入拖动；轻点不触发拖动。
- 拖动结果转换为合法的 `controllerX/controllerY`，由父运行时应用并持久化。
- 进度交互发出 `seek` 意图，父页面映射到现有播放器 seek 命令。
- 鼠标位于播放器区域时滚轮上/下发出 previous/next 意图，并做节流与一次动作去重。
- 输入、按钮、链接、选择框和 slider 不触发长按拖动。

## 9. VRR 与动画调度

- 所有可见连续动画使用 `requestAnimationFrame` 和实际时间差 `dt`，不得通过固定 60/120 FPS gate 丢弃显示帧。
- Wallpaper Engine 兼容桥继续发送 `fps: 0`，含义是由 rAF/显示器节拍驱动。
- 删除 `bridge.js` 对全局 `setInterval` 的 16ms monkey patch；只把确认属于可见动画的 1ms 任务改为 rAF 或专用合并器。
- CSS 动画优先使用 transform/opacity 等合成属性。
- 音频特征采样、媒体元数据、网络、SSE、日志和后台轮询保留独立有界频率。
- 运行状态报告 `framePacing: "vrr-driver-managed"`、`fixedFpsLimit: null`，不报告驱动无法验证的“已开启 G-SYNC/FreeSync”。
- AMD、NVIDIA 和无 VRR 设备使用同一代码路径；无 VRR 时自然回退到显示器呈现节拍。

## 10. Rust 调音台架构

### 10.1 数据流

```text
HTMLMediaElement
  → Web Audio PCM worklet
  → Java loopback audio stream
  → JNI direct buffer
  → Rust/OxiMedia stereo upmix (2 → 5.1/7.1)
  → Rust Mixer DSP
  → Google OBR binaural renderer
  → XAudio2 stereo output
```

Rust 上混不可用时，现有 C++ 虚拟声道矩阵作为回退；只要得到合法 2/6/8 声道块，仍可进入 Rust Mixer。Mixer 不可用或返回错误时旁路该块并继续 OBR，不能中断音频。

### 10.2 ABI

旧 Upmix ABI v1 保持不变。新增独立版本号和导出：

```c
fe_rust_mixer_abi_version();
fe_rust_mixer_create(config);
fe_rust_mixer_stage_params(handle, revision, params);
fe_rust_mixer_commit(handle, revision, ramp_frames);
fe_rust_mixer_process(handle, pcm, frames, channels);
fe_rust_mixer_get_status(handle, status);
fe_rust_mixer_reset(handle);
fe_rust_mixer_destroy(handle);
```

- 所有结构体包含 `struct_size`、`abi_version` 和保留字段。
- 参数在控制线程验证并写入双缓冲快照。
- 音频线程只交换已准备快照，禁止锁、堆分配、文件访问、日志和异常跨 FFI。
- 增益、EQ、压缩和空间参数按 `ramp_frames` 平滑，防止爆音。
- 所有输入输出必须有限；非有限样本归零，最终 limiter 保证范围。

### 10.3 参数

第一版提供：

- enabled、inputGainDb、outputGainDb、balance；
- 10 段 EQ：31/62/125/250/500/1000/2000/4000/8000/16000 Hz；
- stereoWidth、centerGain、surroundGain、lfeGain；
- compressorEnabled、thresholdDb、ratio、attackMs、releaseMs、kneeDb、makeupDb；
- limiterEnabled、ceilingDb、releaseMs；
- reverbEnabled、roomSize、decayMs、damping、preDelayMs、wet、dry；
- upmixAlgorithm 与 OBR 状态只读诊断。

参数边界由 Java 服务和 Rust FFI 同时验证；浏览器描述不是安全边界。

### 10.4 预设

内置预设为版本化的完整参数快照：

- 纯净；
- 浴室；
- 大厅；
- 3D 环绕；
- 影院；
- 人声清晰；
- 低频增强；
- 夜间。

选择预设后用户可继续调整；任意手动变化将 UI 状态标记为“自定义”，不修改内置预设。

## 11. Java 与浏览器边界

新增 `AudioMixerService` 作为唯一配置权威：

- 原子保存版本、revision、当前参数和选中预设；
- 校验参数和 revision；
- 将新快照提交给 `NativeAudioEngine`；
- 返回原生链是否 active、Mixer/Upmix/OBR 状态和旁路原因。

本地受保护接口：

- `GET /api/audio/mixer`
- `PATCH /api/audio/mixer`
- `GET /api/audio/mixer/presets`
- `POST /api/audio/mixer/presets/{id}/apply`

PATCH 使用 revision 做冲突检测，响应保持稳定错误形状。接口仅允许本机、同源客户端；任何网页请求提供的原生库路径或自由 DSP 模块名都必须拒绝。

## 12. 故障与恢复

- 设置中心页面注册失败：该页面显示局部错误，其余设置仍可用。
- 音域回响沙盒未 ready：显示可重试错误，并回到上一个可用场景；不永久停留“加载中”。
- 音域回响高网格恢复失败：退回 last-known-safe，保留 requested 值和原因。
- Mixer 创建失败：旁路 Mixer，继续上混/OBR；状态页显示错误码。
- Mixer 单块处理失败：旁路该块、累计计数；连续失败后停用 Mixer 直到显式重试。
- 原生音频不可用：浏览器音频继续播放，设置页显示“兼容播放，调音台未生效”。
- 配置文件损坏：fail closed 到“纯净”参数并保留损坏证据，不能静默覆盖原文件。

## 13. TDD 与验收

### 13.1 前端与真实浏览器

- 从播放栏点击“文字”，验证参数区域可见、可编辑且非预期 disabled。
- 旧设置按钮不存在；白色齿轮位于播放栏表面且没有可见容器。
- 工具导航无可见托盘/按钮底色，但命中面积、键盘焦点和 ARIA 正常。
- 设置中心在 1280×800、1920×1080、390×844 下无溢出；左侧导航切换对应参数。
- 截图检查墨绿到黑渐变均匀，字体边缘清晰；控制台无错误。
- 音域回响普通参数和高网格目标在重启后保留，实际值与恢复状态准确。
- 歌词拖动/旋转/缩放、空白双击回正、自带播放器长按拖动、seek、滚轮切歌全部经过真实 iframe。
- 视觉帧循环不含固定 FPS gate；在 60/120/144/165Hz 模拟与可用硬件环境下跟随 rAF。

### 13.2 Rust/C++/Java

- Rust 单元测试覆盖静音、脉冲、正弦、NaN/Infinity、2/6/8 声道、每个参数边界、平滑过渡和全部预设。
- 频响与冲激响应测试验证 EQ、压缩、limiter、reverb 的可观察效果。
- 重复处理不分配内存的探针和实时预算基准。
- C++ probe 使用计数器锁定顺序：upmix process < mixer process < OBR process。
- 注入 Mixer 失败，验证音频不中断且旁路计数增加。
- Java probe 验证原子持久化、revision 冲突、配置损坏、重启恢复和本地访问边界。
- 完整原生构建、Java 构建、Web 缓存指纹、Windows 安装资源合同和隔离安装通过。

## 14. 实施顺序

1. 先建立文字参数和设置中心真实浏览器 RED。
2. 修复文字状态并实现设置中心与播放栏视觉迁移。
3. 建立音域回响输入桥、持久化与播放器交互 RED，再逐条实现。
4. 清理可见动画固定 FPS gate 并做实际帧调度验证。
5. 先在 Rust 完成 Mixer 契约与 DSP 测试，再接 C++、JNI、Java 服务和设置 UI。
6. 最后统一缓存 token、安装清单、跨模块回归和真实浏览器视觉验收。

该顺序保证每个阶段都有可运行产品，不要求等待全部原生音频工作完成才恢复文字和设置功能。
