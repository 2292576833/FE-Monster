# FE Monster Java

这是一个 Java 17 纯净房重写项目，目标是替代 FE Player / FE Monster 的后端服务和本地客户端。

原有的 `E:\FE` 项目不会被修改。这个目录包含一个新的 Java 实现，在可能的情况下保持相同的本地 HTTP API 接口形式：

- 默认在 `http://127.0.0.1:3000` 启动本地服务，端口被占用时自动回退到下一个可用端口
- 默认通过 `run.cmd` 启动本地客户端窗口
- 播放器状态、队列、跳转、音量和传输控制接口
- 网易云 API 代理/适配器（搜索、登录状态、歌单、歌曲 URL）
- Visual Bridge（视觉桥接）状态模拟（供本地客户端使用）
- 从 `web/` 目录托管静态客户端资源
- 响应式本地播放器 UI（搜索、歌单、队列、传输控制、进度、音量、二维码登录弹窗）

## 构建

```bat
build.cmd
```

## 运行

```bat
run.cmd
```

可选环境变量：

- `FE_MONSTER_PORT`：服务器端口，默认 `3000`
- `FE_MONSTER_WEB_ROOT`：静态客户端根目录，默认 `web`
- `FE_NETEASE_BASE_URL`：本地网易云音乐 API 地址，默认 `http://127.0.0.1:3010`
- `FE_MONSTER_CLIENT_EXE`：可选，指定用于本地客户端窗口的 Edge/Chrome 可执行文件

启动参数：

- `run.cmd`：构建、启动 Java 服务、打开本地客户端窗口
- `run.cmd --web`：在默认浏览器中打开客户端
- `run.cmd --no-client`：仅启动本地服务

## 说明

Java 版本有意避免使用外部依赖，因此可以直接使用已安装的 JDK 17 编译。它不会替换 UE5 渲染器；而是提供 Java 后端和本地客户端外壳，用于服务于现有的播放器资源。

## 验证

当前本地播放器已验证通过：Java JAR 本地运行、Microsoft Edge 通过 Playwright 测试、桌面端和移动端截图：

- `build/web-player-final-1365x768.png`
- `build/web-player-final-390x844.png`

## GitHub

源代码：https://github.com/2292576833/FE-Monster
