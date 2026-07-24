# FE Monster 苹果端

这是现有 FE Monster 的 macOS 直译壳：Java 后端、Web 界面、组件和音乐 API 插件协议继续使用父项目现有实现，窗口层按原有 Windows 消息协议翻译为 AppKit + WKWebView。业务源码不会在本目录再维护一份；构建时才会把所需资源暂存进 `.app`。

当前只提供源码和构建脚手架，没有生成、发布或上传 macOS 安装包。

## 环境

- macOS 13 或更高版本
- Xcode Command Line Tools（Swift 5.9 或更高）
- JDK 17 或更高；可用 `FE_JAVA_HOME` 指定
- Node.js 18 或更高，用于用户自行导入的网易云、QQ、酷狗 API 插件
- 可选：Python 3 和手势控制依赖

手势控制依赖可在 macOS 上安装为：

```bash
python3 -m pip install -r Build/gesture-requirements-macos.txt
```

macOS 依赖文件没有包含仅限 Windows DirectShow 的 `pygrabber`。

程序数据固定写入：

```text
~/Library/Application Support/FE Monster
```

不会向只读的 `.app/Contents/Resources` 写入账号、插件运行数据或设置。

## 开发运行

在 macOS 终端进入本目录后执行：

```bash
bash Build/run-dev.sh
```

开发脚本会从父项目编译 Java JAR，并让 Swift 壳直接使用父项目的 `web/` 和 `components/`。可覆盖的数据目录和 Java 路径：

```bash
FE_MONSTER_DATA_DIR="$HOME/Library/Application Support/FE Monster Test" \
FE_JAVA_HOME="/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home" \
bash Build/run-dev.sh
```

## 生成 `.app`

```bash
bash Build/build-macos.sh
```

输出位置：

```text
dist/FE Monster.app
```

默认使用 `jlink` 把精简 Java 运行时放进应用。若只想使用系统 Java：

```bash
FE_MONSTER_BUNDLE_JRE=0 bash Build/build-macos.sh
```

Finder 启动的应用不一定能读取 Homebrew 的 shell `PATH`。发布前建议把与目标架构一致的 Node 可执行文件一并放入应用：

```bash
FE_MONSTER_NODE_BINARY="/opt/homebrew/bin/node" bash Build/build-macos.sh
```

父项目 `dist/plugins/` 中已经构建好的网易云、QQ、酷狗 ZIP 会复制到：

```text
FE Monster.app/Contents/Resources/API Plugins
```

它们不会自动加载。用户仍需在 FE Monster 登录页选择“导入 API 插件”，确认本地代码可信后再导入。旧版网易云插件依赖 PowerShell，不能在 macOS 使用；请导入修复后的 Node 运行版 ZIP。

## 本机测试签名

默认不签名。仅用于本机测试的 ad-hoc 签名：

```bash
FE_MONSTER_CODESIGN=adhoc bash Build/build-macos.sh
```

也可把 `FE_MONSTER_CODESIGN` 设为证书身份。正式分发还需要 Developer ID 签名、公证和 Gatekeeper 实机验证；ad-hoc 签名不能代替发布签名。

## 权限

`Build/Info.plist` 已声明本地网络、摄像头、麦克风、屏幕和系统音频用途。应用首次使用相应能力时，macOS 仍会显示系统授权窗口。首版不启用 App Sandbox，因为程序需要启动内置 Java、Node 以及用户明确导入的本地插件代码。

## 清理

```bash
bash Build/clean.sh
```

只删除本目录的 `.build-macos/`、`dist/` 和 Swift 构建缓存，不删除父项目源码，也不删除 `Application Support` 中的用户数据。

## 目前边界

- Windows XAudio2 原生音频路径在 macOS 上回退到现有 Web Audio；系统全局音频捕获后续需要 CoreAudio 或 ScreenCaptureKit 的原生实现。
- Windows PowerShell 自动更新脚本不会在 macOS 执行。
- 摄像头手势控制除了 Camera 权限，还可能需要 Accessibility / Input Monitoring 授权。
- 必须在真实 macOS Intel 与 Apple Silicon 设备上完成 WebGL、录制、扫码文件选择、插件子进程和退出清理验证。
