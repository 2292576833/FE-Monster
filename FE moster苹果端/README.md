# FE Monster macOS 客户端

复用父项目的 Java 后端、Web 界面、组件和音乐 API；窗口使用 AppKit + WKWebView。当前版本与根目录 `package.json` 一致（2.2.3）。支持 Intel 和 Apple Silicon，分别在对应架构的 Mac 上构建。

## 构建环境

- macOS 13.5 或更高（随包 Node.js 24 的最低系统要求）
- Xcode Command Line Tools，Swift 5.9 或更高
- JDK 17 或更高，可通过 `FE_JAVA_HOME` 指定
- Node.js 20 或更高及 npm、curl、zip、unzip
- CMake 3.24+、Cargo/Rust 1.85+（edition 2024），原生音频编译还使用 Xcode Command Line Tools

在此目录执行：

```bash
bash Build/build-macos.sh
```

产物是 `dist/FE Monster.app`、带架构名的 `.dmg` 和 SHA-256 文件。默认附带精简 Java 运行时、经过 SHA-256 校验的官方独立 Node.js 24.21.0、SQLite macOS 驱动、Keychain JNI 库、CoreAudio / Rust 上混 / Google OBR 动态库、QuickJS 音源运行时，以及四个平台的当前音乐 API 插件。新电脑无需额外安装 Java 或 Node。

音乐 API 优先验证并复用父项目 `dist/plugins` 的当前版本；缺少有效包时，从现有源代码构建。插件同时放在应用资源的 `App/plugins/music-api`（首次启动自动配置）和 `API Plugins`（手动导入）。所有运行数据都进入用户数据目录。旧版 ZIP 不会随应用重复打包。

可以用 `FE_MONSTER_NODE_BINARY` 指定同架构、无外部 dylib 依赖的独立 Node；依赖 Homebrew 动态库的 Node 会被拒绝。`FE_MONSTER_BUNDLE_JRE=0` 可生成依赖系统 Java 的开发包；此类包不用于干净安装验收。`FE_MONSTER_DMG=0` 可只生成 `.app`。

## 开发运行

```bash
FE_MONSTER_DATA_DIR="$HOME/Library/Application Support/FE Monster Test" \
FE_JAVA_HOME="/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home" \
bash Build/run-dev.sh
```

开发运行使用父项目 `web`，其余资源暂存到 `.build-macos`，不另行维护业务源码。开发数据目录覆盖只在非正式 `.app` 的 `FE_MONSTER_DEV=1` 模式生效，要求绝对路径且不能位于应用资源目录内。

## 账号与本地数据

正式应用固定写入：

```text
~/Library/Application Support/FE Monster
```

每个客户端启动自己拥有的 Java 进程和随机回环端口，退出时只停止该进程。安装资源目录不会保存账号、插件运行状态或设置。

网易云、QQ 和酷狗官方扫码登录通过隔离的 Chrome 或 Edge 窗口完成；需要已安装 Chrome 或 Edge。Safari 不提供这里所用的浏览器会话读取协议。扫码确认后，客户端保存凭据、验证账号和歌单，再同步界面；窗口关闭或暂时请求失败不会立即丢掉已捕获的会话。

本地桌宠记忆通过 macOS 当前用户 Keychain 保存密钥信封，磁盘只保存不透明引用，记录继续使用认证加密。Keychain 不可用、引用损坏或来自其他用户环境时停止持久化，不写入明文。Windows DPAPI 备份不能直接跨平台恢复到 Mac。

## 验证与签名

本机测试签名和完整打包验证：

```bash
FE_MONSTER_CODESIGN=adhoc bash Build/build-macos.sh
bash Build/check-bundle.sh
node ../scripts/check-macos-keychain.mjs
```

验证会检查原生架构、签名、Java/Node、SQLite 实际读写、资源完整性、隔离数据目录下的四平台首次配置、首页/API、正常退出，以及两个独立 JVM 之间的 Keychain 持久化和损坏引用拒绝。

根项目 `.github/workflows/macos.yml` 提供 Intel 与 Apple Silicon 构建验收，推送专用构建分支 `codex/macos-native-port-20261007` 时触发，也保留手动入口。验证后的 DMG 保存为 CI artifact，不发布 Release。工作流尚需在远端运行；Windows 上的静态检查不能代替 Mac 原生编译和实机验收。

`FE_MONSTER_CODESIGN` 也接受 Developer ID 证书身份。签名按内置运行时、动态库、外层应用的顺序执行。正式公开分发仍需完成 Apple 公证和 Gatekeeper 实机验证；ad-hoc 签名仅用于测试。默认未提供证书时不签名。

## 平台范围

- 主窗口、WebGL 场景、账号/歌单、社区接口、API 插件和音源运行时复用现有业务代码。
- 原生 CoreAudio 输出使用独立音频回调、Rust 上混、调音台与 Google OBR。原生组件不可用时保留 Web Audio 播放。最小化仍维持播放检查，切歌时优先恢复输出上下文。
- 原生桌面宠物、每屏桌面映射、独立桌面歌词和壁纸窗口通过菜单与共享桥接控制；主窗口隐藏后仍同步场景与歌词。桌面歌词可锁定穿透、拖动及中键解锁。
- ScreenCaptureKit 负责系统音频和窗口录制，AVAssetWriter 直接写 H.264/AAC MP4；支持暂停、继续、完成与另存。麦克风使用 AVAudioEngine；录制预览通过随机令牌的本机流读取文件。
- 自动更新选择当前处理器架构的官方 DMG，检查 SHA-256、应用标识、Developer ID 签名及同一 Team ID，再替换当前拥有后端的应用；用户数据保留在应用外。ad-hoc 测试包无法通过正式签名更新验收。
- 当前工作环境为 Windows，上述 Swift / CoreAudio 实现需要 GitHub Actions 的真实 macOS 编译结果；系统录屏、摄像头、麦克风授权和实际设备输出仍需 Mac 验收。Windows Wallpaper Engine 属于第三方 Windows 程序，Mac 使用独立原生桌面窗口承载本项目场景。

## 清理

```bash
bash Build/clean.sh
```

只删除此目录的构建产物，不删除用户数据。
