# FE Monster 桌宠 Live 实时对话方案

> 版本：2026-08-06
> 目标：借鉴 ChatGPT Live / OpenAI Realtime API 已公开的交互原理，让桌宠从“录完一段再回答”升级为可连续倾听、可打断、可实时执行程序操作、声音与粒子同步的陪伴式语音代理。

## 1. 结论

不应只给现有桌宠换一个更快的 STT。真正需要复制的是一条完整的实时闭环：

```text
持续会话
  → 实时音频输入
  → 语义断句 / 长按提交
  → 流式理解与回复
  → 实时工具调用
  → 流式语音输出
  → 用户随时打断
  → 只保留用户实际听到的上下文
  → 桌宠粒子、字幕、气泡与同一事件流同步
```

FE Monster 最合适的路线不是立刻替换 DeepSeek，而是先做一个与模型供应商无关的 `RealtimeConversationEngine`。现有 DeepSeek、记忆、客户端工具和 TTS/RVC 都保留；先把当前链路升级成流式，再把 OpenAI Realtime 作为可选引擎接入。这样不会把桌宠能力锁死在单一 API 上。

## 2. “ChatGPT Live 原理”的公开边界

ChatGPT 客户端内部全部实现并未公开。本方案只依据 OpenAI 官方公开的 Realtime / Voice Agents 设计，不假定 ChatGPT 私有实现细节。

公开资料可以确认的关键机制：

1. **持续、有状态的实时会话**：连接保持打开，客户端持续发送音频并接收音频、文本、工具和状态事件，而不是每句话都发一次普通 HTTP 请求。
2. **浏览器端优先 WebRTC**：浏览器直接采集和播放实时音频时，官方建议 WebRTC；服务器持有原始 API 密钥，客户端只获得临时凭证。
3. **两种语音架构**：原生 speech-to-speech 延迟最低、轮次更自然；STT → 文本模型 → TTS 的串联方案更易复用现有文本代理、审计和音色系统。
4. **VAD 与语义断句**：既可按静音判断说完，也可依据语义判断用户是否真的讲完；还可关闭 VAD，继续使用长按说话。
5. **流式事件**：文本、音频、转写和函数参数都可以增量到达，界面不必等待整段完成。
6. **可打断与截断**：用户在助手说话时开口，当前回复立即取消；未播放部分从会话上下文移除，避免下一轮误以为用户已经听完整段话。
7. **函数 / 工具闭环**：模型提出结构化工具调用，应用执行真实操作，回传结果后模型再继续说，而不是让模型假装操作成功。
8. **服务器侧控制通道**：浏览器负责低延迟音频，服务器可通过同一会话的 sideband 通道保管工具、业务规则、记忆与密钥。

官方依据：

- [Realtime and audio](https://developers.openai.com/api/docs/guides/realtime)
- [Voice agents](https://developers.openai.com/api/docs/guides/voice-agents)
- [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [Realtime API with WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc)
- [Voice activity detection](https://developers.openai.com/api/docs/guides/realtime-vad)
- [Webhooks and server-side controls](https://developers.openai.com/api/docs/guides/realtime-server-controls)

## 3. 当前 FE Monster 链路

当前实现已经具备可复用的主体能力：

- `web/pet-assistant.js`
  - 长按说话与可配置热键；
  - 麦克风 AEC、降噪、自动增益；
  - 浏览器实时转写或服务器 STT 回退；
  - 音频上传、消息增量显示、服务器语音播放；
  - 调用 `window.FeMonsterPetActionBridge` 执行客户端操作。
- `E:/FE moster server/pet-deepseek.js`
  - 按用户和设备隔离语音回合；
  - DeepSeek 文本流式输出；
  - 工具调用、幂等请求、动作租约、结果回传；
  - FE ID 记忆、音色选择、Kokoro / Edge / RVC / IndexTTS2 等语音路线。
- `web/pet-client-context.js`
  - 提供播放、预设、社区、账号和程序状态快照。
- `web/pet-emotion-runtime.js`、`web/pet-companion-p2.js`
  - 已有心情、精力、主动聊天和音乐行为信号。
- `web/pet-particle-orb.js`
  - 已能按桌宠状态和真实音频驱动粒子，但还没有统一消费全部行为信号。

当前主要延迟和体验断点：

1. 本地 PCM 使用 `ScriptProcessor` 收集完整回合，松开后才编码、上传和识别；这仍是“录音文件请求”，不是真正的实时音频流。
2. 服务器虽会流式返回 DeepSeek 文本，但 TTS 在完整回答生成后才合成，因此第一句语音仍需等待整段答案。
3. 没有浏览器 STT 时，首次长按会先查询服务器语音能力再申请麦克风，首按反馈可能被网络查询拖慢；能力结果应在登录/启动后预热并缓存。
4. 即使已取得麦克风，当前代码仍会等待 `ensureSession()` 后才真正启动 PCM / MediaRecorder；冷会话期间用户已经说出的开头存在漏录风险。采集必须先开始，会话连接在旁路并行完成。
5. 浏览器 SpeechRecognition 的 final、松开时合并 final、录音 final 目前可能分别到达服务器，存在重复提交和顺序竞争；新 `TurnController` 必须是 final commit 的唯一所有者。
6. 当前开始播放回复时会终止录音链路，但新的 PTT 又不会完整取消正在播放和服务器正在生成的回复，尚未形成真正的双工“边说边听”和自然插话。
7. 客户端已有本地 `replyPlaybackGeneration` 用于停止旧 `<audio>`，但没有跨客户端与服务器的“已播放到多少毫秒”账本；被打断后无法准确区分已经听到与尚未听到的回答。
8. 服务器当前没有按 `sessionId / requestId` 暴露可取消的 DeepSeek、TTS、RVC 与子进程控制器；新回合遇到旧回合处理中还可能得到 409，晚到事件也缺少统一的 turn epoch 拦截。
9. 客户端状态、文本增量、工具进度、音频播放和粒子动画来自多条独立链路，容易出现“文字已完成、声音还没开始、粒子先回待机”。
10. 现有 `pet.ai.delta` 是瞬时 SSE 事件，重连后不会补发中间 delta；最终状态可以收敛，但实时 UI 需要序号与快照补偿。
11. 语音块会进入服务器持久数据结构；实时模式应默认使用短生命周期缓冲，转写完成后删除原始音频。

## 4. 目标架构

```text
┌──────────────────────────── Windows 客户端 ────────────────────────────┐
│ 麦克风 / 长按热键 / 连续对话                                            │
│   ↓ AudioWorklet 或 WebRTC 音轨                                         │
│ RealtimeSessionCoordinator                                             │
│   ├─ TurnController：轮次、VAD、长按、打断                              │
│   ├─ PlaybackLedger：已播放时间、队列、截断                              │
│   ├─ ContextDeltaPublisher：只发送发生变化的程序状态                     │
│   ├─ ToolClient：FeMonsterPetActionBridge 的唯一执行入口                │
│   └─ PetExpressionAdapter：字幕、气泡、粒子、状态                         │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ 实时媒体 + 控制事件
┌──────────────────────── FE Monster Server ─────────────────────────────┐
│ RealtimeGateway                                                        │
│   ├─ 身份、临时凭证、重连与会话续接                                     │
│   ├─ MemoryProjector：FE ID 长期记忆 + 当前最小上下文                     │
│   ├─ ToolBroker：工具定义、幂等、动作结果、审计                           │
│   ├─ DeepSeekLiveAdapter：流式 STT → DeepSeek → 分句 TTS                 │
│   └─ OpenAIRealtimeAdapter（可选）：WebRTC + server sideband             │
└────────────────────────────────────────────────────────────────────────┘
```

核心约束：

- 主程序仍是播放、歌单、社区、成就和参数的**唯一业务状态写入者**。
- 桌面粒子窗口只负责输入、显示、播放与动画，不再重复初始化整套主页面。
- 所有模型引擎使用同一套 FE 事件协议；切换模型不应改 UI、工具或记忆代码。

建议把实时能力收敛成一个深模块，而不是继续向聊天组件堆控制器：

```ts
interface LiveConversation {
  startTurn(options?: TurnOptions): Promise<TurnHandle>;
  pushAudioFrame(frame: AudioFrame): void;
  commitInput(): Promise<void>;
  interrupt(reason: string): Promise<void>;
  subscribe(listener: (event: LiveEvent) => void): () => void;
}
```

底层可分别接 `/api/community/pet/realtime` 鉴权 WebSocket、OpenAI WebRTC，或现有 POST + SSE 降级适配器；上层状态机、工具、粒子与聊天面板只依赖这个接口。

## 5. FE 自有实时事件协议

不要把界面直接绑死在某一家 API 的事件名称上。建议新增统一事件层：

```text
fe.pet.live.session.ready
fe.pet.live.input.speech_started
fe.pet.live.input.speech_stopped
fe.pet.live.input.transcript_delta
fe.pet.live.input.transcript_final
fe.pet.live.response.started
fe.pet.live.response.text_delta
fe.pet.live.response.audio_chunk
fe.pet.live.response.cancelled
fe.pet.live.response.completed
fe.pet.live.tool.requested
fe.pet.live.tool.progress
fe.pet.live.tool.completed
fe.pet.live.transport.reconnecting
fe.pet.live.transport.recovered
```

每个事件至少带：

```json
{
  "sessionId": "...",
  "turnId": "...",
  "requestId": "...",
  "generation": 1,
  "sequence": 12,
  "timestamp": 0,
  "payload": {}
}
```

`generation + sequence` 用于丢弃旧回复和乱序包；`requestId` 继续复用现有幂等与动作租约能力。

## 6. 轮次状态机

```text
offline → connecting → idle
                       ↓
                    listening
                       ↓
                  committing
                       ↓
                    thinking
                 ↙            ↘
             executing       speaking
                 ↘            ↙
                       idle
```

关键转移：

| 当前状态 | 事件 | 行为 |
| --- | --- | --- |
| `idle` | 长按 / VAD 检测到语音 | 立即进入 `listening`，粒子先响应，不等待网络 |
| `listening` | 松开 / 语义判断说完 | 提交本轮音频，进入 `committing` |
| `thinking` | 收到文本增量 | 气泡逐字出现，保持思考粒子态 |
| `thinking` | 收到工具调用 | 进入 `executing`，执行真实客户端操作 |
| `speaking` | 用户开始说话 | 120 ms 内静音；取消生成；按已播放位置截断；转入 `listening` |
| 任意在线态 | 网络断开 | 保留本地播放控制，进入 `reconnecting`，不重复执行工具 |
| `reconnecting` | 会话恢复 | 携带最后确认的 `sequence` 续接；超时则新建会话并注入摘要 |

工具已经执行后，打断只停止后续解说，不能回滚已经完成的切歌或参数操作。可取消的搜索任务与不可取消的已提交社区发布必须在工具描述中显式区分。

## 7. 三种交互模式

保留用户目前习惯的长按输入，同时增加 ChatGPT Live 式连续对话：

1. **长按说话（默认、最可靠）**
   - 按下立即中断桌宠语音；
   - 松开提交；
   - VAD 只裁掉前后静音和判断“没说清”，不替用户决定何时发送。
2. **连续对话**
   - 用户显式开启后麦克风持续工作；
   - 优先语义 VAD，避免用户停顿半秒就被抢话；
   - 用户说话可自然打断桌宠。
3. **混合模式**
   - 点击桌宠进入一段连续会话；
   - 离开、静默超时或再次点击后退出；
   - 全局长按热键始终可以抢占当前回复。

三种模式共用同一个状态机和记忆，不维护三套业务逻辑。

当前网页快捷键只在 WebView 文档获得键盘事件时可靠。若要求主窗口失焦、桌宠浮在其他应用上方时仍能长按说话，Windows 桌面宿主还需通过 `RegisterHotKey / WM_HOTKEY` 或受控的低级键盘桥实现真正的系统级触发，并由原生层显式处理 WebView2 麦克风权限；网页层不能假装自己是全局热键。

## 8. 音频链路

### 8.1 输入

- OpenAI Realtime 路线：浏览器 / WebView2 使用 WebRTC 音轨；API 密钥只在服务器，客户端只拿临时凭证。
- DeepSeek 路线：用 `AudioWorklet` 生成 10–20 ms PCM 帧，通过二进制 WebSocket 发送；逐步淘汰主线程 `ScriptProcessor` 与整段 Base64 上传。
- 保留当前 `echoCancellation`、`noiseSuppression`、`autoGainControl`。
- 麦克风能量与音乐播放能量必须分开，防止 Sonic 音乐或桌宠自己的 TTS 触发 VAD。
- 采集建立后立即写入本地环形缓冲，不等待服务器会话创建；连接完成后从 pre-roll 开始发送，保证冷启动不吃掉句首。
- 每个音频帧带采样时钟和序号；服务器做小型抖动缓冲，不凭 HTTP 到达时间判断顺序。

### 8.2 输出

提供两档而不是强迫所有音色走同一条链：

- **实时自然档**：原生 speech-to-speech，或可流式的 Kokoro / Edge 路线；优先第一声音延迟。
- **克隆音色档**：文本按短句分块 → 基础 TTS → RVC；保留用户训练音色，但接受更高延迟。

DeepSeek 串联路线的 TTS 不再等待完整回答：

1. 文本流遇到可靠短句边界就送入合成；
2. 第一段音频完成后立即播放；
3. 后续短句在后台排队；
4. 块间做极短交叉淡化，避免爆音和明显拼接；
5. 每块绑定 `generation`，打断后旧块即使晚到也不能播放。

RVC 对过短音频容易不稳定，因此按语义短句而不是按字切分；实时档和克隆档使用不同的分块策略。

## 9. 打断与“实际听到的上下文”

这是 Live 体验最重要、也最容易遗漏的部分。

当用户在桌宠说话时开口：

1. 客户端立即降低并停止当前回复音频；
2. 记录 `playedUntilMs`，清空未播放队列；
3. 向引擎发送 `cancel(responseId)`；
4. 服务器按 `requestId` 中止 DeepSeek fetch、TTS fetch、RVC / IndexTTS2 请求及可取消子进程，并把本轮标记为 `cancelled`；
5. 客户端和服务器同时提升 turn epoch，所有旧 epoch 的晚到文本、音频、工具结果和完成事件一律丢弃；
6. 将本轮助手回复截断到用户实际听到的位置；
7. 气泡可保留完整文字用于查看，但未听部分标记为“被打断”，不能作为下一轮已陈述事实；
8. 粒子快速收拢一次，然后无闪烁地转入倾听态。

WebRTC 原生引擎可使用服务端管理的播放缓冲和自动截断；自建 WebSocket / DeepSeek 链路则由 `PlaybackLedger` 保存每块的起止时间并主动完成截断。

## 10. 工具调用与程序接管

现有 `FeMonsterPetActionBridge` 和服务器动作租约应保留，Realtime 只改变“何时调用”和“如何流式反馈”。

建议将工具划分为：

- **本地即时工具**：播放、暂停、切歌、搜索、切预设、调参数、读取状态；主客户端直接执行。
- **服务器工具**：记忆、好友、私信、社区、作品发布、服务器更新查询；由服务器统一校验与审计。
- **只读联网工具**：搜索和读取公开信息；不允许下载或在外部网站写入。

执行规则：

- 每个工具调用必须有 `callId + requestId`，重连重放不能导致二次切歌或重复发布。
- 本机工具 registry 的 `inspect / claim / execute` 继续作为“当前客户端是否能执行”的权威，Realtime 模型不能绕过它直接改状态。
- 超过约 400 ms 的操作可以先说一句极短前导，如“我找一下”，但不提前声称完成。
- 工具返回真实结果后再生成结束语；失败时说明具体失败环节并保留可重试上下文。
- 客户端参数与工具清单改变时，只发送差异，不在每轮重复灌入全部状态。

## 11. 记忆与实时程序状态

采用三层上下文：

1. **当前实时状态**：当前歌曲、进度、播放状态、预设、可见社区页面、网络状态；客户端只推变化事件。
2. **本次会话短期记忆**：最近几轮话语、刚执行的工具及打断位置；由 Realtime 会话持有。
3. **FE ID 长期记忆**：称呼、明确偏好、常用歌单、常用参数；继续保存在 FE Monster 服务器。

不要以 60 FPS 把整个客户端快照发送给模型。建议：

- 播放进度用于本地触发与动画，不每秒进入模型上下文；
- 换歌、暂停、预设变化、页面变化等离散事件即时发送；
- 连续参数拖动结束后发送最终值；
- 对话开始时注入一份最小快照，随后只发 delta；
- 原始凭据、Cookie、令牌和本地路径永不进入模型上下文。

Realtime 官方会话有时长边界，因此在到期前创建新会话，注入结构化摘要和未完成工具状态；音频侧无感切换，避免桌宠每小时“失忆”。

## 12. 粒子桌宠如何真正“活起来”

新增统一的 `PetExpressionFrame`，把系统状态、情绪和真实声音合成一份每帧可消费的数据：

```json
{
  "systemState": "listening",
  "behavior": "curious",
  "reaction": "speech_onset",
  "inputEnvelope": 0.42,
  "outputBands": [0.2, 0.7, 0.4],
  "toolProgress": 0.0,
  "interrupted": false
}
```

表现映射：

| 状态 | 粒子表现 |
| --- | --- |
| 待机 | 低幅呼吸和极慢漂移 |
| 倾听 | 麦克风真实包络让外层粒子向中心聚拢；检测到语音时出现柔和环波 |
| 转写 | 少量粒子形成短暂流线，字幕同步增量出现 |
| 思考 | 低速分层轨道，不使用无意义高速旋转 |
| 执行工具 | 粒子沿操作方向产生一次定向流动 |
| 说话 | 直接分析实际输出音频的低、中、高频，驱动球体呼吸和局部发光 |
| 被打断 | 轻快收束后立即转为倾听，不黑屏、不重建画布 |
| 离线重连 | 保留本地呼吸，外圈以低频短脉冲提示连接状态 |

需要把现有 `data-pet-behavior`、`data-pet-reaction` 与 `data-state` 合并到这一适配器；否则后台已有情绪，用户看到的仍只是一颗动作单一的球。

现有粒子已经能从桌宠回复音频读取低、中、高频；这部分直接复用。麦克风侧目前主要是 CSS 音量等级和合成脉冲，Live 改造时由同一个采集 `AudioWorklet` 输出 mic RMS / bands，才能让“听用户说话”也是真实声音驱动。

## 13. 隐私、可靠性与降级

- 连续对话必须由用户显式开启，并持续显示麦克风状态；长按模式仍是默认。
- 原始 API 密钥只放服务器；浏览器只使用短期会话凭证。
- 原始麦克风音频默认只存在内存 / 临时环形缓冲，转写完成或超时立即删除；长期只保存用户允许的转写和审计摘要。
- 网络切换后自动重连，但工具结果按 `requestId` 去重。
- Realtime 不可用时依次降级：流式 DeepSeek → 现有长按 STT / 完整 TTS → 文字回复；本地播放控制不依赖 AI 服务器。
- 桌面窗口、主程序和浏览器内桌宠只能有一个业务动作所有者，避免同一命令被执行两次。
- 音频播放失败不能把整轮标记失败；文字与真实工具结果仍应保留。

## 14. 分阶段落地

### P0：统一状态与测量，不改变现有功能

- 新增 `pet-live-protocol.js` 与 `RealtimeSessionCoordinator`。
- 为现有 HTTP / SSE 链路做适配器，先统一事件而不替换后端。
- 增加端到端时间戳：按下、检测到语音、提交、首个转写、首个文本、首个音频、工具完成。
- 把现有本地 `replyPlaybackGeneration` 扩展成跨完整 turn 的 `PlaybackLedger + epoch`，解决旧文本、旧语音和旧完成事件晚到的问题。
- 登录或启动后异步预热 STT / TTS 能力状态，长按开始时不再阻塞查询服务器能力。
- 麦克风就绪后立即开始 pre-roll 采集，`ensureSession()` 并行执行；由 `TurnController` 独占 final commit，消除 SpeechRecognition 与录音双提交竞争。
- 将现有行为 / 情绪信号接入粒子适配器。

### P1：把当前 DeepSeek 链路做成真正的流式串联

- `AudioWorklet + 二进制 WebSocket` 持续发送音频帧。
- 新增鉴权 `/api/community/pet/realtime` 通道，同时保留现有 POST + SSE 作为自动降级路径。
- 服务器返回转写 delta / final，替换“整段录完才识别”的主路径。
- DeepSeek 文本按语义短句增量送入 TTS；客户端边收边播。
- 完成长按抢占、按请求 AbortController、播放队列取消和已播放位置截断。
- 保留原 HTTP 语音接口作兼容回退。

### P2：增加可选 OpenAI Realtime 引擎

- 服务器创建临时客户端凭证或统一建立 WebRTC 会话，客户端不接触主密钥。
- 浏览器 / WebView2 用 WebRTC 传输音频和控制事件。
- 服务器用 sideband 连接同一会话，托管 FE 工具、记忆和业务规则。
- 将 Realtime 函数调用映射到现有 `ToolBroker`，结果仍回到同一会话。
- 模型 / 引擎在服务器后台可选，用户的音色、记忆和工具不随引擎丢失。

### P3：连续对话与高级表现

- 上线长按、连续、混合三种模式。
- Windows 桌面形态增加真正的全局长按热键与 WebView2 麦克风权限桥；仅在程序内使用时仍走普通 DOM 键盘事件。
- 增加语义 VAD 灵敏度、打断灵敏度、回复语速和主动语音开关。
- 粒子使用输入 / 输出真实频谱，气泡使用转写和回复增量。
- 对 55 分钟左右的长会话做无感续接与摘要迁移。

### P4：稳定性与发布

- 弱网、丢包、乱序、服务器重启、睡眠唤醒、音频设备切换全链路回归。
- 多账号和多电脑隔离；同一 FE ID 的记忆可恢复但活动麦克风会话不串线。
- 对安装包环境验证 WebView2、麦克风权限、音频设备与防火墙提示。
- 逐步灰度；异常自动切回现有长按模式。

## 15. 验收指标

以下是 FE Monster 的工程目标，不是对第三方 API 的承诺：

| 指标 | 目标 |
| --- | --- |
| 按下热键到粒子进入倾听态 | P95 ≤ 50 ms |
| 检测用户开口到界面反馈 | P95 ≤ 120 ms |
| 用户说完到进入思考态 | P95 ≤ 250 ms |
| 用户打断到回复静音 | P95 ≤ 120 ms |
| 实时引擎首个可听回复 | P50 ≤ 650 ms，P95 ≤ 1.2 s |
| DeepSeek 串联首个可听回复 | P95 ≤ 1.8 s |
| 工具开始后本地状态反馈 | P95 ≤ 200 ms |
| 重连 / 重放导致重复工具执行 | 0 次 |
| 被打断后未听内容进入下一轮上下文 | 0 次 |
| 音频播放时粒子与真实声音偏差 | ≤ 1 个渲染帧 |

还要记录分段耗时，不能只看“总响应时间”：

```text
capture → turn detect → transcript → model first delta
        → tool start/result → TTS first chunk → audio first frame
```

## 16. 必测场景

1. 桌宠说到 20%、50%、80% 时分别插话，声音立即停且下一轮语义正确。
2. 音乐大声播放时说话，AEC 后仍能识别；桌宠自己的声音不会触发自我对话。
3. 连续快速说“暂停、换下一首、再回来”，顺序正确且不重复执行。
4. 搜索到相似歌名时只在真正存在歧义时追问。
5. TTS、RVC 或 Realtime 单独故障时能降级到文字，不影响工具执行结果。
6. 网络断开后恢复，旧音频不能突然播放，已完成工具不能再次执行。
7. 主窗口与桌面桌宠同时存在时只执行一次命令。
8. 切换 FE ID 后会话、音色和记忆完全隔离。
9. 连续会话跨越时长边界后无感续接，不丢未完成任务。
10. 退出程序后麦克风、AudioContext、WebRTC、WebSocket、TTS 进程全部释放。

## 17. 推荐的第一批实现范围

第一批只做四件事，收益最大、风险最小：

1. 统一 `fe.pet.live.*` 事件和状态机；
2. 建立 `PlaybackLedger`，先把打断、旧音频和上下文截断做正确；
3. 将 DeepSeek 已有文本 delta 按短句送入 TTS 队列，让桌宠先说第一句；
4. 把真实输入 / 输出音频包络接到粒子，并让粒子消费现有行为与情绪信号。

完成这一批后，即使尚未启用 OpenAI Realtime，桌宠也会明显接近 Live：更早开口、可以插话、状态连续、声音与形象同步。随后再接 WebRTC 原生引擎，只需新增适配器，不需要重写工具、记忆和 UI。
