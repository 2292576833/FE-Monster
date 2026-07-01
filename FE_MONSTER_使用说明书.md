# FE Monster Java 使用说明书

> 版本：1.0.0-java | 更新日期：2026-07-01

---

## 目录

- [1. 项目概述](#1-项目概述)
- [2. 快速开始](#2-快速开始)
- [3. 系统架构](#3-系统架构)
- [4. 后端服务](#4-后端服务)
- [5. 前端界面](#5-前端界面)
- [6. 核心功能](#6-核心功能)
- [7. API 接口文档](#7-api-接口文档)
- [8. 网易云音乐登录](#8-网易云音乐登录)
- [9. Visual Bridge 视觉桥接](#9-visual-bridge-视觉桥接)
- [10. 组件库](#10-组件库)
- [11. 文件结构](#11-文件结构)
- [12. 开发指南](#12-开发指南)
- [13. 常见问题](#13-常见问题)

---

## 1. 项目概述

FE Monster Java 是一个 Windows 桌面音乐播放客户端，使用 **Java 17** 作为后端服务 + **Web 前端**作为界面层。它将 FE Monster / FE Player 的体验迁移为一个本地 Java 客户端项目，提供沉浸式的黑胶舞台音乐播放体验。

### 1.1 核心特性

- **本地 Java 服务**：使用 JDK 标准库（HttpServer、HttpClient）搭建 HTTP 服务，无外部依赖
- **桌面客户端窗口**：通过 Edge/Chrome 的 --app 模式启动独立窗口
- **网易云音乐集成**：搜索、歌单、歌词、歌曲 URL 代理播放
- **3D 粒子球舞台**：Canvas 2D 渲染的动态呼吸发光粒子球
- **透明玻璃播放栏**：使用 SVG 滤镜实现毛玻璃效果
- **3D 歌词场景**：带深度层次的歌词展示与节拍驱动动画
- **动态魔方场景**：32^3 体素方块场，随音乐律动
- **二维码登录**：网易云音乐扫码登录，Cookie 持久化
- **播放器状态持久化**：队列、音量、进度等状态保存到本地 JSON 文件
- **Visual Bridge**：模拟视觉状态数据，驱动前端视觉效果
### 1.2 技术栈

| 层级 | 技术 |
|------|------|
| 后端语言 | Java 17 |
| HTTP 服务 | com.sun.net.httpserver.HttpServer |
| HTTP 客户端 | java.net.http.HttpClient |
| JSON 处理 | 自实现轻量 JSON 解析器 SimpleJson |
| 前端 | 原生 HTML + CSS + JavaScript (ES Module) |
| 3D 引擎 | Three.js (r128) |
| GLSL 着色器 | OGL (WebGL 库) 实现 Lightfall 启动动画 |
| 动画引擎 | GSAP (GreenSock) |
| 构建工具 | build.cmd 批处理脚本 |

---

## 2. 快速开始

### 2.1 环境要求

- **JDK 17+**（必须）
- **Windows 系统**（推荐 Windows 10/11）
- **Edge 或 Chrome 浏览器**（用于本地客户端窗口）
- **网易云音乐 API 服务**（可选，默认 http://127.0.0.1:3010）

### 2.2 构建与运行

```bat
:: 构建项目
build.cmd

:: 运行（构建 + 启动服务 + 打开本地客户端窗口）
run.cmd

:: 仅在浏览器中打开
run.cmd --web

:: 仅启动服务，不打开客户端
run.cmd --no-client
```

首次运行会自动编译所有 Java 源码并生成 JAR 包到 out/ 目录。

### 2.3 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| FE_MONSTER_PORT | 3000 | 服务端口，自动向后回退 20 个端口 |
| FE_MONSTER_WEB_ROOT | web | 静态客户端资源根目录 |
| FE_NETEASE_BASE_URL | http://127.0.0.1:3010 | 网易云音乐 API 地址 |
| FE_MONSTER_CLIENT_EXE | （自动查找） | 指定 Edge/Chrome 可执行文件路径 |

### 2.4 访问

服务启动后，可在以下地址访问：

    http://127.0.0.1:3000/

---
## 4. 后端服务

### 4.1 入口类

**FeMonsterJavaApp.java** — 应用主入口

启动流程：
1. 解析端口和环境变量
2. 初始化 AppContext（包含 PlayerService、NeteaseClient、VisualBridgeService）
3. 创建 HttpServer，绑定 127.0.0.1
4. 注册 API 路由（/api/）
5. 注册静态文件服务（/components/、/）
6. 根据需要启动本地客户端窗口

### 4.2 播放服务

**PlayerService.java** — 播放状态管理

核心状态模型：
- queue：播放队列（上限 100 首）
- queueIndex：当前歌曲在队列中的索引
- currentSong：当前歌曲信息
- playing / audioLoaded：播放状态
- position / duration：进度（秒）
- volume：音量 (0.0 ~ 1.0)
- url：当前歌曲播放 URL
- clockStartedAt / positionAtClockStart：用于计算播放时钟

功能：
- 播放/暂停/切换/上一首/下一首
- 设置队列、合并队列（支持 append / next 模式）
- 音量调节、进度跳转
- 状态持久化到 data/player-state.json
- 启动时从文件恢复状态

### 4.3 网易云客户端

**NeteaseClient.java** — 网易云音乐 API 代理

功能：
- 搜索歌曲（分页）
- 获取歌曲播放 URL（支持音质选择）
- 获取歌词
- 获取登录状态和用户信息
- 二维码登录（创建/检查）
- 获取用户歌单、歌单曲目
- 每日推荐、最近播放、喜欢的歌曲
- 登录 Cookie 持久化到 data/netease-auth.json
- 封面图片代理转发（/api/cover）

### 4.4 静态文件服务

**StaticFileHandler.java** — 静态资源托管

- 提供 web/ 和 components/ 目录的静态文件
- 支持 HTML/CSS/JS/JSON/图片/音频等 MIME 类型
- SPA 友好：404 时回退到 index.html
- HTML/CSS/JS 禁用缓存（用于开发）

### 4.5 HTTP 工具

**HttpUtil.java** — HTTP 工具类

- 查询参数解析
- JSON/文本/字节响应发送
- CORS 头添加
- 参数类型安全转换（int、double 带范围校验）

### 4.6 JSON 解析器

**SimpleJson.java** — 自实现轻量 JSON 解析器

- 零依赖 JSON 解析和序列化
- 支持对象、数组、字符串、数字、布尔、null
- 支持 Unicode 转义

---
## 5. 前端界面

### 5.1 启动画面 (Boot Screen)

启动过程：
1. 显示深色渐变背景，带粉紫色扫光动画
2. "FE moster" 标题文字逐字弹入，带模糊到清晰效果
3. 标题上的光泽扫光和粉色扫描光动画
4. Lightfall GLSL 着色器动画背景（OGL 库渲染，鼠标可交互）
5. 点击标题进入主界面

### 5.2 粒子球舞台 (Orb Stage)

核心视觉：
- 760 个白色发光粒子组成球体
- 粒子呈 Fibonacci 球体分布
- 跟随音乐能量产生呼吸变化
- 粒子有拖尾效果（蓝色渐变流光）
- 鼠标拖拽可旋转视角（带惯性）
- 环境光条穿梭效果

### 5.3 透明玻璃播放栏 (Glass Dock)

- SVG + CSS 实现的毛玻璃效果
- 底部居中定位
- 包含：封面缩略图 / 歌曲信息 / 播放控制 / 进度条 / 音量控制
- 带混合模式的彩色光晕边缘

### 5.4 3D 歌词场景 (Playback Lyric)

- 6 层深度层次的歌词叠加（CSS 3D变换）
- 歌词逐字高亮进度
- 心跳/节拍驱动的脉冲和弹跳
- 鼠标拖拽旋转视角

### 5.5 动态魔方 (Dynamic Cube)

- 32^3 体素方块场（Three.js 渲染）
- 基于音频低频/能量驱动方块高度
- 配色方案根据专辑封面或当前播放状态变化

### 5.6 网易云歌单轨道 (Orbit Playlists)

- 4 张歌单卡片在粒子球周围悬浮
- 带玻璃质感的光晕卡片
- 点击加载歌单曲目到播放架

### 5.7 播放架 (Playlist Shelf)

- 3D 翻转效果的正反面双面面板
- 正面显示歌单歌曲列表
- 反面为额外信息展示
- 鼠标拖拽 + 惯性滑动

### 5.8 DIY 面板

- 预设切换（3D歌词 / 动态魔方）
- 频谱显示（低频能量条）
- 歌词亮度 / 跳动速度 / 魔方强度滑块

### 5.9 搜索面板

- 顶部居中玻璃搜索框
- 支持输入关键词搜索网易云音乐
- 搜索结果展示歌名、歌手、封面

---
## 6. 核心功能

### 6.1 音乐播放

播放流程：
1. 搜索歌曲或打开歌单，选择歌曲
2. 前端调用 /api/player/load 加载歌曲
3. 后端通过网易云 API 获取歌曲播放 URL
4. 前端 audio 元素加载 URL 并播放
5. 定期轮询 /api/player/state 更新播放状态

支持功能：
- 播放 / 暂停
- 上一首 / 下一首（队列循环）
- 进度拖拽跳转
- 音量调节
- 队列管理（替换队列 / 合并队列）

### 6.2 搜索

支持按关键词搜索网易云音乐歌曲，结果包含：
- 歌曲 ID
- 歌曲名
- 歌手
- 专辑名和封面
- 时长

### 6.3 歌单

- 显示当前登录用户的网易云歌单（上限取前 4 个）
- 歌单卡片在粒子球周围排列
- 点击歌单加载曲目到播放架
- 播放架支持滚动浏览和选择播放

### 6.4 音频可视化

两种模式：
1. **Web Audio API**：通过 AnalyserNode 实时分析音频频域数据（低频、中频、高频、能量、节拍）
2. **Visual Bridge**：后端模拟的视觉数据（当 Web Audio 不可用时）

可视化数据驱动：
- 粒子球呼吸脉动
- 3D 歌词脉冲和发光
- 动态魔方块高度变化
- DIY 面板频谱条

### 6.5 键盘交互

| 操作 | 方式 |
|------|------|
| 鼠标拖拽舞台 | 旋转粒子球或歌词场景视角 |
| 双击舞台 | 重置视角 |
| 右键 | 在播放架隐藏时显示播放架 |
| 点击启动 Logo | 进入主界面 |

---
## 7. API 接口文档

所有 API 返回 JSON 格式，基础路径 http://127.0.0.1:3000/api/。

### 7.1 应用信息

**GET /api/app/version** — 返回应用版本信息

```json
{
  "name": "FE Monster Java",
  "version": "1.0.0-java",
  "runtime": "17.0.x",
  "ok": true
}
```

### 7.2 播放控制

| 接口 | 说明 |
|------|------|
| GET /api/player/state | 获取完整播放状态 |
| GET /api/player/play | 恢复播放 |
| GET /api/player/pause | 暂停播放 |
| GET /api/player/toggle | 切换播放/暂停 |
| GET /api/player/previous | 上一首 |
| GET /api/player/next | 下一首 |
| GET /api/player/seek?position=秒 | 跳转到指定位置 |
| GET /api/player/volume?value=0.0~1.0 | 设置音量 |
| GET /api/player/load?id=xxx&title=xxx... | 加载并播放指定歌曲 |
| POST /api/player/queue | 设置播放队列 |
| POST /api/player/queue/merge | 合并队列 |

### 7.3 网易云音乐

| 接口 | 说明 |
|------|------|
| GET /api/search?keyword=xxx&page=1&limit=20 | 搜索歌曲 |
| GET /api/song/url?id=xxx&quality=standard | 获取歌曲播放 URL |
| GET /api/lyric?id=xxx | 获取歌词 |
| GET /api/login/status | 获取当前登录状态 |
| GET /api/login/qr/key | 获取二维码登录 key |
| GET /api/netease/login/qr/create?key=xxx | 创建登录二维码 |
| GET /api/netease/login/qr/check?key=xxx | 检查二维码登录状态 |
| GET /api/netease/user/playlists | 获取用户歌单列表 |
| GET /api/netease/playlist/tracks?id=xxx&limit=50 | 获取歌单曲目 |
| GET /api/netease/daily/recommend?limit=30 | 每日推荐 |
| GET /api/netease/recent/songs?limit=30 | 最近播放 |
| GET /api/netease/liked/songs?limit=30 | 喜欢的歌曲 |
| GET /api/netease/service/status | 网易云服务状态检查 |

### 7.4 视觉桥接

| 接口 | 说明 |
|------|------|
| GET /api/visual-bridge/health | 健康检查 |
| GET /api/visual-bridge/state | 获取完整视觉状态 |

### 7.5 其他

| 接口 | 说明 |
|------|------|
| GET /api/cover?url=图片URL | 封面图片代理（解决跨域） |
| GET /api/update/latest | 检查更新 |
| GET /api/weather/radio?code=xxx | 天气电台（预留） |
| GET /api/podcast/hot | 热门播客（预留） |

---
## 8. 网易云音乐登录

### 8.1 登录流程

1. 点击右上角"网易云登录"按钮
2. 弹出二维码对话框
3. 后端获取二维码 key，生成二维码图片
4. 使用网易云音乐 App 扫描二维码并确认
5. 后端轮询登录状态，成功后将 Cookie 保存到本地
6. 关闭对话框后，页面显示已登录状态

### 8.2 登录持久化

登录成功后，Cookie 自动保存到：

    data/netease-auth.json

下次启动应用时会自动恢复登录状态，无需重新扫码。

### 8.3 登出

Cookie 过期后需重新扫码。删除 data/netease-auth.json 可清除本地登录凭据。

### 8.4 依赖

网易云音乐功能依赖第三方网易云音乐 API 服务（默认 http://127.0.0.1:3010）。
可以通过 FE_NETEASE_BASE_URL 环境变量配置。

---
## 9. Visual Bridge 视觉桥接

Visual Bridge 是后端模拟的视觉状态服务，为前端提供实时视觉数据。

### 9.1 数据模型

返回 JSON 包含以下主要字段：
- schema: fe.visual-state.v1
- updatedAt: 更新时间戳
- song: 当前歌曲信息（含 queueIndex）
- playback: 播放状态（playing, time, duration, rate）
- lyric: 歌词状态（text, progress, lines）
- audio: 音频能量（energy, bass, mid, treble, beat, onset）
- colors: 颜色值（RGB 归一化 0~1）
- fx: 特效参数（preset, intensity, speed, tintMode）
- shelf: 舞台参数（mode, cameraMode, opacity 等）
- queue: 队列状态
- beatMap: 节拍映射

### 9.2 音频模拟

当真实音频分析不可用时，Visual Bridge 提供基于正弦波模拟的音频数据：
- energy: 0.46 + 0.18 * sin(t*2.2)
- bass: 0.50 + 0.30 * sin(t*1.7)
- mid: 0.38 + 0.22 * sin(t*3.3)
- treble: 0.32 + 0.28 * sin(t*7.1)

---
## 10. 组件库

项目在 components/ 目录维护一组可复用的 UI 组件和样式。

### 10.1 组件索引

| 组件 | 文件 | 用途 |
|------|------|------|
| GlassSurface | .jsx + .css | 玻璃材质容器，播放栏/浮层/控制面板 |
| ElectricBorder | .jsx + .css | 电流边框，选中态/重点面板强调 |
| LineWaves | .jsx + .css | 线性波形背景，音乐视觉/能量场 |
| MagicBento | .jsx + .css | Bento 卡片网格，功能入口/模块集合 |
| ScrollStack | .jsx + .css | 堆叠滚动卡片，分段内容展示 |
| AnimatedList | .jsx + .css | 动画列表，队列/搜索结果/歌单条目 |
| AnimatedContent | .jsx | 内容进入动画 |
| FadeContent | .jsx | 淡入内容过渡 |
| GradientText | .jsx + .css | 渐变文字，品牌展示或视觉标题 |
| Cubes | .jsx + .css | 方块交互视觉，背景互动/视觉实验 |
| GlassIcons | .jsx + .css | 玻璃质感图标 |
| ShinyText | .jsx + .css | 闪光文字效果 |

### 10.2 使用规范

- 能复用现有组件时，优先调用或复用其样式
- 组件服务用户意图，不为了炫技堆砌组件
- 新实现需保持与现有组件的命名、圆角、动画、颜色和交互习惯一致

---
## 11. 文件结构

<pre>
E:\FE moster/
├── build.cmd                          # 编译脚本
├── clean.cmd                          # 清理构建产物
├── run.cmd                            # 运行脚本
├── README.md                          # 项目基础说明
├── PRODUCT.md                         # 产品目标和设计原则
├── PROJECT_STATUS.md                  # 项目状态说明
├── NETEASE_LOGIN_PERSISTENCE.md       # 网易云登录持久化说明
├── jsrepo.config.mjs                  # JavaScript 仓库配置
│
├── build/                             # 构建产物和日志
├── data/                              # 运行时数据
│   ├── netease-auth.json              # 网易云登录凭据
│   ├── player-state.json              # 播放器状态持久化
│   └── local-client-profile/          # 本地客户端浏览器配置
│
├── src/main/java/com/femonster/
│   ├── FeMonsterJavaApp.java           # 应用入口
│   ├── api/ApiRoutes.java             # API 路由
│   ├── core/
│   │   ├── AppContext.java            # 应用上下文
│   │   ├── PlayerService.java         # 播放服务
│   │   ├── VisualBridgeService.java   # 视觉桥接服务
│   │   └── ProjectPaths.java          # 项目路径
│   ├── desktop/LocalClientLauncher.java# 本地客户端启动器
│   ├── http/
│   │   ├── HttpUtil.java              # HTTP 工具
│   │   └── StaticFileHandler.java     # 静态文件处理器
│   ├── json/SimpleJson.java           # JSON 解析器
│   ├── model/
│   │   ├── Song.java                  # 歌曲模型
│   │   └── Playlist.java             # 歌单模型
│   └── netease/NeteaseClient.java     # 网易云客户端
│
├── web/                               # 前端资源
│   ├── index.html                     # 主页面
│   ├── styles.css                     # 主样式
│   ├── app.js                         # 主应用逻辑
│   ├── boot-lightfall-react.js        # Lightfall 启动动画
│   ├── desktop-lyrics.html            # 桌面歌词子页面
│   ├── wallpaper.html                 # 壁纸模式页面
│   ├── sonic-topography-preset.js     # 声波地形预设
│   ├── reactbits-glass-skin.css       # Reactbits 玻璃皮肤
│   ├── default-user-fx-archive.json   # 默认特效存档
│   ├── vendor/
│   │   ├── gsap.min.js                # GSAP 动画引擎
│   │   ├── three.r128.min.js          # Three.js 3D 引擎
│   │   └── music-tempo.min.js         # BPM 检测库
│   ├── assets/
│   │   └── skull-decimation-points.bin# 骷髅点云数据
│   └── reactbits/                     # React 组件版本
│       ├── index.html
│       ├── src/
│       └── dist/
│
└── components/                        # 可复用 UI 组件
    ├── README.md                      # 组件使用说明
    ├── GlassSurface.jsx/.css          # 玻璃材质
    ├── ElectricBorder.jsx/.css        # 电流边框
    ├── LineWaves.jsx/.css             # 线性波形
    ├── MagicBento.jsx/.css            # Bento 卡片
    ├── ScrollStack.jsx/.css           # 堆叠滚动
    ├── AnimatedList.jsx/.css          # 动画列表
    ├── AnimatedContent.jsx            # 内容进场动画
    ├── FadeContent.jsx               # 淡入过渡
    ├── GradientText.jsx/.css          # 渐变文字
    ├── Cubes.jsx/.css                 # 方块视觉
    ├── GlassIcons.jsx/.css            # 玻璃图标
    └── ShinyText.jsx/.css             # 闪光文字
</pre>

---
## 12. 开发指南

### 12.1 开发环境

推荐使用 VS Code 或 IntelliJ IDEA 进行开发。项目无需 Maven/Gradle，纯 JDK 编译。

### 12.2 构建 JAR

```bat
build.cmd
```

编译后的 JAR 包位于 out/，文件名格式为 fe-monster-java-随机数-随机数.jar。
最新版本始终复制为 out/fe-monster-java.jar。

### 12.3 调试模式

```bat
:: 仅启动服务，方便前端调试
run.cmd --no-client
:: 然后在浏览器中打开 http://127.0.0.1:3000
```

### 12.4 添加新 API

1. 在 ApiRoutes.java 的 handleGet 或 handlePost 中添加路由
2. 在对应的 Service 类中实现业务逻辑
3. 前端通过 fetch(/api/...) 调用

### 12.5 添加新 UI

1. 先检查 components/ 是否有可复用的组件
2. 在 web/index.html 中添加 DOM 结构
3. 在 web/styles.css 中添加样式
4. 在 web/app.js 中添加交互逻辑

### 12.6 前端开发注意事项

- 前端是原生 JS，没有框架绑定
- 使用 els 对象统一管理 DOM 元素引用
- 使用 state 对象管理全局状态
- 使用 Canvas 2D 渲染粒子球（非 WebGL）
- 网易云接口需要跨域，后端已统一代理

---
## 13. 常见问题

### 13.1 端口被占用怎么办？

服务会自动尝试 3000 ~ 3020 端口，如果都被占用，会使用系统分配的随机端口。
也可以设置环境变量 FE_MONSTER_PORT 指定端口。

### 13.2 网易云音乐功能用不了？

1. 确保第三方网易云 API 服务正在运行（默认 http://127.0.0.1:3010）
2. 检查 FE_NETEASE_BASE_URL 环境变量是否正确
3. 如果 API 服务在另一台机器上，需修改为对应地址
4. 部分歌曲可能因版权原因无法获取播放 URL

### 13.3 本地客户端窗口打不开？

1. 确保已安装 Edge 或 Chrome
2. 可以通过 FE_MONSTER_CLIENT_EXE 环境变量指定浏览器路径
3. 回退方案：使用 run.cmd --web 在浏览器中打开
4. 检查 Windows 防火墙是否阻止了 Java 进程

### 13.4 播放状态没有自动恢复？

检查 data/player-state.json 文件是否存在且格式正确。
如果文件损坏，删除后重启应用即可重建。

### 13.5 登录状态丢失？

1. 检查 data/netease-auth.json 是否存在
2. Cookie 可能已过期，重新扫码登录一次
3. 确认 API 服务时间与服务器同步

### 13.6 粒子球不动了？

- 检查是否开启了 prefers-reduced-motion（系统辅助功能设置）
- 检查浏览器是否支持 Canvas 2D
- 检查是否有控制台错误

### 13.7 画面出现乱码？

部分中文文件需要使用 UTF-8 编码。如果发现中文乱码，
请检查文件编码并转换为 UTF-8。

---

> 本文档由 FE Monster Java 项目自动生成。
