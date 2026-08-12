# FE Monster 项目状态说明

更新时间：2026-08-11。

当前 Windows 版本为 **2.0.1 正式版**。本文记录当前源码、回归契约与已发布联网安装包具备的能力。

## 当前架构

- Java 17 本地服务负责静态资源、播放 API、音乐平台代理、社区同源代理和桌面桥接；端口默认从 `3000` 开始并支持 `FE_MONSTER_PORT`。
- Windows 原生壳使用 WebView2，已接入后台托盘、DPI 布局、透明桌宠窗口、拖动与输入区域控制；无法启动原生壳时仍可使用网页模式。
- 前端使用原生 HTML、CSS 和 JavaScript，主界面已从早期“单粒子球 + 底栏”扩展为播放器、歌词、场景 DIY、社区和桌宠的完整桌面体验。
- 社区服务和本地 Chatterbox/Sherpa 等语音运行时保持独立进程，通过受限接口接入客户端。

## 已实现能力

### 播放、歌词与视觉

- 播放队列、上一首/下一首、进度、音量、歌曲 URL、封面和多音乐平台 API 插件接入。
- 单排、多排、双语和桌面歌词，包含缩放、旋转、偏移、时间校准以及清晰度回归约束。
- Sonic、粒子封面、克拉尼、自由方块、3D 场景、场景 DIY、Wallpaper Engine 和桌面场景映射。
- 桌宠粒子使用高 DPI 帧缓冲、抗锯齿圆盘和单批 Points 渲染；语音、播放状态与聊天情绪可驱动粒子动作和颜色。

### 社区与身份

- 8 位 FE ID、头像、昵称、好友、私聊、消息免打扰、动态/创作社区和一起听歌。
- 身份卡展示、换卡、材质/颜色/出场动画定制预览、服务器专属卡发放、不可编辑昵称约束和邮箱领取流程。
- 成就与头像挂饰的服务端同步、本地离线合并、听歌时长上报和服务器备份链路。

### 桌宠与语音

- DeepSeek 对话、记忆、工具执行、语音选择、完整回复语音播放和用户打断。
- 新用户程序演示由桌宠移动到目标控件、同步高亮并逐步讲解；用户可以退出或打断演示。
- Chat Live Phase 0–5a 已实现：有界遥测、单麦克风 AudioWorklet、Sherpa Online STT、播放游标与账本、AudioContext 连续播放，以及鉴权的 200 ms HTTP 批次桥接。
- Online STT 使用 16 kHz / 20 ms 帧、修订 partial、endpoint、最终转写和离线终校；已安装模型通过文件校验后自动启用，并在 HTTP 监听启动后后台预热。

详细顺序和安全边界见 [docs/PET_CHAT_LIVE_ARCHITECTURE.md](docs/PET_CHAT_LIVE_ARCHITECTURE.md)，与 OpenLive 的关系见 [docs/PET_OPENLIVE_COMPATIBILITY.md](docs/PET_OPENLIVE_COMPATIBILITY.md)。

## 仍未完成或明确延期

- **Phase 5b 未实现**：binary WSS 与每个 live session 的单 owner actor 仍需先由部署遥测证明必要性。
- **Phase 6 未完成**：Windows Java 代理、安装器和本机并发基线已有验证，但公网 10/50/100 会话持续 canary 尚未执行，不能写成已完成。
- **代码签名仍未完成**：2.0.1 联网安装器已经发布并附带 SHA-256，但尚未配置 Authenticode，Windows SmartScreen 可能提示未知发布者。
- 音乐、云端语音和社区公网能力仍受用户配置、第三方服务可用性、版权和账号权限约束。

## 回归覆盖入口

当前源码中的主要验证入口包括：

- `FE moster server/test-local-streaming-stt.mjs`：Sherpa OnlineRecognizer、partial/final、端点、幂等、容量和离线终校。
- `FE moster server/test-pet-live-stt-bridge.mjs`：鉴权会话、200 ms 批次、序号、重放、回收和公开状态裁剪。
- `scripts/check-pet-live-audio-capture.mjs`：AudioWorklet 的 16 kHz / 20 ms 帧和安装载荷契约。
- `scripts/check-pet-live-playout-integration.mjs`：连续播放、真实播放边界、游标、打断和遥测接线。
- `scripts/check-pet-particle-clarity.mjs`：桌宠粒子的 DPI、抗锯齿、材质和批量渲染约束。
- `scripts/check-pet-native-desktop-runtime.mjs`：Windows 原生桌宠窗口的打开、输入、拖动和几何状态。
- `scripts/check-web-cache-fingerprints.mjs`：网页入口缓存版本与文件指纹一致性。

这些是回归入口，不代表公网 Phase 6 canary 或正式发布已经完成。

## 主要文件索引

- `README.md`：产品入口、版本和授权边界。
- `UPDATE.md`：2.0.1 正式版范围、安装器和校验信息。
- `src/main/java/com/femonster/FeMonsterJavaApp.java`：Java 服务入口。
- `src/main/java/com/femonster/desktop/LocalClientLauncher.java`：本地客户端启动。
- `src/main/java/com/femonster/api/ApiRoutes.java`：HTTP API 与代理路由。
- `web/index.html`、`web/app.js`、`web/styles.css`：当前主界面与播放/场景运行时。
- `web/pet-assistant.js`、`web/pet-particle-orb.js`：桌宠对话、演示、语音与粒子运行时。
- `docs/PET_CHAT_LIVE_ARCHITECTURE.md`：Chat Live 正式架构和阶段边界。
