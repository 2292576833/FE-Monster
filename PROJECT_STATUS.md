# FE Monster Java 项目状态说明

本文记录这个项目目前做了什么、是怎么做的，以及现在推进到哪里。更新时间：2026-07-01。

## 项目在做什么

FE Monster Java 是把原来的 FE Monster / FE Player 体验迁移成一个本地 Java 客户端项目。

当前目标不是继续做普通网页播放器，而是做一个 Windows 本地启动的音乐播放客户端：

- 用 Java 17 启动本地 HTTP 服务。
- 默认通过本地客户端窗口打开界面，而不是只给一个浏览器网页。
- 保留音乐播放相关 API，包括播放状态、队列、上一首、下一首、进度、音量、歌曲 URL、网易云相关接口代理。
- 前端界面改成沉浸式黑色舞台：中心是白色呼吸发光粒子球，底部是透明玻璃播放栏。
- 不做手机端适配，优先桌面客户端体验。

## 已经完成的事

### 1. 本地 Java 服务

入口文件：

- `src/main/java/com/femonster/FeMonsterJavaApp.java`

已经实现：

- 默认端口为 `3000`。
- 如果 `3000` 被占用，会自动尝试后续端口。
- 支持通过环境变量 `FE_MONSTER_PORT` 指定端口。
- 启动后注册 `/api/` 接口。
- 静态托管 `web/` 目录。
- 额外托管 `/components/`，让前端页面可以直接调用组件样式，例如 `components/GlassSurface.css`。

启动方式：

```bat
run.cmd
```

其他模式：

```bat
run.cmd --web
run.cmd --no-client
```

### 2. 本地客户端窗口

相关文件：

- `src/main/java/com/femonster/desktop/LocalClientLauncher.java`

已经实现：

- 默认优先打开本地客户端窗口。
- 优先查找 Edge / Chrome。
- 使用 `--app=<url>` 打开独立窗口，看起来更接近桌面客户端。
- 本地客户端 profile 放在 `data/local-client-profile/`。
- 如果本地客户端打不开，会回退到默认浏览器。

### 3. 播放服务和 API

主要文件：

- `src/main/java/com/femonster/api/ApiRoutes.java`
- `src/main/java/com/femonster/core/PlayerService.java`
- `src/main/java/com/femonster/netease/NeteaseClient.java`

已经实现：

- `/api/player/state`
- `/api/player/play`
- `/api/player/pause`
- `/api/player/previous`
- `/api/player/next`
- `/api/player/seek`
- `/api/player/volume`
- `/api/player/load`
- `/api/player/queue`
- `/api/search`
- `/api/song/url`
- `/api/cover`
- `/api/netease/...`

播放状态会保存到：

- `data/player-state.json`

### 4. Visual Bridge 状态

相关文件：

- `src/main/java/com/femonster/core/VisualBridgeService.java`

已经实现：

- `/api/visual-bridge/health`
- `/api/visual-bridge/state`

目前 Visual Bridge 是 Java 模拟状态，会根据播放状态生成能量、低频、节拍、颜色、队列等数据，用来驱动前端视觉。

### 5. 当前前端界面

主要文件：

- `web/index.html`
- `web/styles.css`
- `web/app.js`

当前界面已经从原来的多面板 Web UI 收敛成桌面舞台：

- 页面主体只有粒子球舞台。
- 去掉了粒子球上的标签卡片。
- 去掉了除底部播放栏以外的 UI 卡片和菜单按钮。
- 保留底部播放栏：上一首、播放 / 暂停、下一首、进度、音量、歌曲封面和歌曲信息。
- 底部播放栏已经改成透明玻璃样式。
- 播放栏使用 `components/GlassSurface.css` 的玻璃材质基础样式。

### 6. 粒子球

相关文件：

- `web/app.js`
- `web/styles.css`

已经实现：

- 白色粒子球。
- 呼吸式发光。
- 跟随播放能量产生视觉变化。
- 支持鼠标拖动旋转。
- 舞台为桌面全屏布局。

当前版本已经按最新要求去掉球上的标签和菜单，只保留视觉粒子球本体。

### 7. 组件调用规则文档

相关文件：

- `components/README.md`

已经写入一份组件调用说明，核心原则是：

- 每次执行 UI 任务前，先理解用户真实意图。
- 先检查 `components/` 是否已有合适组件。
- 如果用户点名组件文件，比如 `GlassSurface.jsx` 或 `GlassSurface.css`，优先读取并调用。
- 能复用现有组件或样式时，不重新手写一套。

## 是怎么做的

### 后端实现方式

项目没有引入复杂框架，使用 Java 17 标准能力完成：

- `com.sun.net.httpserver.HttpServer` 提供本地 HTTP 服务。
- `java.net.http.HttpClient` 请求网易云相关服务和封面资源。
- 自定义 `SimpleJson` 做轻量 JSON 解析和输出。
- `PlayerService` 管理播放队列、音量、进度、当前歌曲和本地状态保存。
- `NeteaseClient` 负责对接网易云 API。
- `StaticFileHandler` 负责静态资源托管。

这样做的好处是启动简单、依赖少、容易打成 jar。

### 前端实现方式

当前前端是原生 HTML / CSS / JavaScript：

- `web/index.html` 定义舞台、canvas、底部播放栏和 audio 元素。
- `web/styles.css` 负责整体黑色舞台、粒子背景、透明玻璃播放栏、按钮、进度条和音量条。
- `web/app.js` 负责调用 API、控制 audio、刷新播放状态、绘制粒子球、处理鼠标旋转。

透明玻璃播放栏的实现方式：

- 页面引入 `/components/GlassSurface.css`。
- 播放栏使用 `glass-surface glass-surface--fallback` 类名。
- 再用 `web/styles.css` 覆盖成小尺寸、黑灰透明、圆角、底部居中的样式。

## 当前做到哪里了

### 已完成

- Java 项目可以构建成 `out/fe-monster-java.jar`。
- `run.cmd` 可以构建并启动服务。
- 默认本地客户端窗口逻辑已接入。
- 静态前端可以由 Java 服务打开。
- `/components/GlassSurface.css` 已能被页面加载。
- 播放栏已经改成底部中间的小尺寸透明玻璃样式。
- 粒子球舞台已经保留为主视觉。
- 除底部播放栏以外的 UI 卡片和菜单按钮已经移除。

### 已验证

最近一次验证结果：

- `/components/GlassSurface.css` 返回 `200`。
- 页面控制台没有发现错误。
- 底部播放栏位置为底部居中。
- 播放栏尺寸约为 `680 x 74`。
- 底部间距约为 `22px`。
- 居中误差为 `0`。
- 透明玻璃效果包含 `backdrop-filter: blur(22px)`。

验证截图：

- `build/transparent-glass-dock-desktop.png`

### 还没完全收尾

- 当前极简界面没有搜索、歌单、登录、队列列表等入口；这些后端接口还在，但前端暂时没有暴露。
- 真实歌曲播放依赖网易云 API 服务和歌曲 URL 是否可用。
- 部分中文 UI 文案和文档在当前读取结果中出现乱码迹象，需要统一检查文件编码并修正为 UTF-8。
- 粒子球的鼠标旋转已经实现，但如果后续还要把菜单挂在球体上，需要重新设计挂载方式；当前最新需求是去掉球上标签和菜单。
- 当前明确不做手机端，后续验证应以桌面尺寸为主。

## 下一步建议

1. 先修复前端和文档中的中文乱码问题。
2. 决定是否恢复搜索 / 歌单 / 队列入口。如果恢复，建议不要做成大卡片，可以做成隐藏抽屉或快捷键面板。
3. 继续打磨粒子球旋转手感和播放能量响应。
4. 给底部播放栏补充真实歌曲加载路径，保证用户不通过搜索界面也能试播。
5. 每次 UI 修改后继续用桌面浏览器截图验证，不再优先做手机端检查。

## 主要文件索引

- `README.md`：项目基础说明、构建和运行命令。
- `PRODUCT.md`：产品目标、设计原则和体验方向。
- `PROJECT_STATUS.md`：当前这份项目状态说明。
- `build.cmd`：编译 Java 并生成 jar。
- `run.cmd`：构建并启动项目。
- `src/main/java/com/femonster/FeMonsterJavaApp.java`：Java 服务入口。
- `src/main/java/com/femonster/desktop/LocalClientLauncher.java`：本地客户端窗口启动。
- `src/main/java/com/femonster/api/ApiRoutes.java`：HTTP API 路由。
- `src/main/java/com/femonster/core/PlayerService.java`：播放状态和队列逻辑。
- `src/main/java/com/femonster/core/VisualBridgeService.java`：视觉状态模拟。
- `web/index.html`：当前桌面客户端页面结构。
- `web/styles.css`：当前粒子舞台和透明玻璃播放栏样式。
- `web/app.js`：播放控制和粒子球逻辑。
- `components/GlassSurface.css`：玻璃材质样式来源。
- `components/README.md`：组件复用规则。
