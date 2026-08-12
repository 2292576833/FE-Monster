# 桌宠与 OpenLive 的兼容策略

更新时间：2026-08-11。

FE Monster **没有安装或内嵌整套 OpenLive**。项目只参考了其轮次控制思路，并保留 FE Monster 自己的 DeepSeek、Sherpa STT、Chatterbox/RVC、记忆和工具执行链。

参考来源：[katipally/openlive](https://github.com/katipally/openlive)（MIT License）。对应实现是独立重写的 `web/pet-live-turn-controller.js`，没有复制 OpenLive 的 Electron / Next.js 应用或服务端实现。

## 当前语音链路

- `web/pet-live-audio-worklet.js` 将同一麦克风流下混、重采样为 16 kHz 单声道，并按 20 ms / 320 样本帧输出。
- `FE moster server/local-streaming-stt.js` 使用 Sherpa `OnlineRecognizer` 和中英双语 streaming Zipformer，持续产生修订后的 partial、endpoint 与 authoritative final。
- Sherpa `OfflineRecognizer` 只用于最终校正和确定性回退，不再承担伪流式重复解码。
- 客户端将 10 帧合并成 200 ms 批次，经鉴权的同源 HTTP 接口和 Windows Java 代理发送；批次具有单调序号、幂等重放与有界队列。
- 回复仍由 DeepSeek 文本流驱动，AudioContext 播放时间线按实际 `playing` 边界显示对应文字，并支持本地先停声、服务端再取消的打断流程。

完整模块边界和顺序规则见 [PET_CHAT_LIVE_ARCHITECTURE.md](PET_CHAT_LIVE_ARCHITECTURE.md)。

## 实现边界

Chat Live 的 Phase 0–5a 已实现并有本地回归覆盖。Phase 5b 的 binary WSS / 单 owner actor 仍是按遥测决定是否投入的延期项；Phase 6 只完成了本机、Windows Java 代理和安装器契约验证，尚未完成 10/50/100 会话的公网持续 canary。

本次兼容工作没有从 OpenLive 引入以下内容：

- OpenLive 的 Electron / Next.js 应用与 WebSocket 服务；
- OpenLive 分发的 Whisper、Kokoro、Supertonic 或 Smart-Turn 权重；
- 为兼容 OpenLive 而增加的 npm / Python 运行依赖；
- 安装后首次运行时从 OpenLive 或外部 CDN 拉取模型。

FE Monster 自身独立配置的语音提供方不属于上述 OpenLive 兼容范围。
