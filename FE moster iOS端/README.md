# FE Monster iOS 端

这是独立的 iPhone 原生壳。桌面端 `web/`、`components/` 和全部场景预设不会被复制回源码；构建时只读父目录，并把一次性副本放进 `App/GeneratedResources/`。

## 当前结构

- SwiftUI + `WKWebView`：显示共享播放器和全部桌面预设。
- `WebOverlay/`：仅调整 iPhone 安全区、按键布局和触控尺寸，按钮继续使用桌面端同款黑色 GlassSurface 材质。
- Node.js Mobile v18.20.4：在设备本机运行固定的网易云、QQ、酷狗适配器。
- 原生桥：Node 先用 `listen(0)` 让系统分配 `127.0.0.1` 端口，再通过 App 沙盒内的 nonce 握手文件回传；Bearer token 不进入网页。
- Keychain：首次启动生成 32 字节网关 vault key，以后复用；服务账号数据写到受保护的 Application Support。
- 同机扫码：网页可请求原生保存/分享二维码，并打开网易云、QQ 音乐或酷狗客户端。
- 页面安全：生成的 iOS HTML 移除内联脚本，并由 meta 与自定义 scheme 响应头同时应用严格 CSP。

## 构建要求

- macOS 14 或更新版本
- Xcode 15.4 或更新版本
- XcodeGen
- Node.js + npm（只在构建阶段安装已锁定的纯 JavaScript 依赖）
- Python 3.9 或更新版本（只用于组装一次性资源副本）

```bash
brew install xcodegen node
cd "FE moster iOS端"
bash ./Build/build-ios.sh
```

脚本会执行：

1. 下载官方 Node.js Mobile v18.20.4 iOS XCFramework。
2. 校验固定 SHA-256：`8c5ca3a0d1e38de7f182a5642593e82593b820efd375a14b3ecafc4bcfee620e`。
3. 复制共享 Web/组件到忽略提交的生成目录，并在平台运行时分流前注入 iOS 运行时。
4. 用锁文件安装本地网关依赖。
5. 生成 Xcode 工程并构建 iPhone 模拟器版本。

大体积 XCFramework、`node_modules`、生成后的 Web 副本和 Xcode 工程都不会提交。

## 真机

先在钥匙串安装有效的 Apple 开发/分发签名证书，并准备匹配
`com.femonster.ios` 的 provisioning profile。Team ID 本身不能完成签名。
准备完后生成归档：

```bash
DEVELOPMENT_TEAM=你的TeamID bash ./Build/archive-ios.sh
```

如果这台 Mac 已在 Xcode 登录开发者账号，可按需增加
`FE_IOS_ALLOW_PROVISIONING_UPDATES=1`，让 Xcode 更新 provisioning profile。
无头 CI 还必须安全导入证书、私钥和 profile，或配置 App Store Connect
API key；脚本不会伪造这些签名材料。

也可先运行 `bash ./Build/generate-project.sh`，再用 Xcode 打开 `FEMonsterIOS.xcodeproj`，选择自己的开发团队和 iPhone。

模拟器可以验证界面、预设、网关和 API 响应；“打开音乐 App + 同机扫码 + 真实账号授权”必须在已安装网易云、QQ 音乐、酷狗的实体 iPhone 上分别测试。

## 安全边界

- 网关只监听 `127.0.0.1`，端口和短期 Bearer token 每次启动随机生成。
- 端口由 Node 直接绑定后通过随机 nonce 握手回传，不存在“先探测空闲端口再关闭”的抢占窗口。
- 网页只能请求 `/api` 和 `/health`，不能让原生层访问任意 URL。
- 原生转发禁用重定向与 Cookie 存储，并限制 64 KB 请求、2 MB 响应。
- 网关响应中的 `Set-Cookie`、授权头不会返回网页。
- 二维码尝试按平台限量并节流；保存/分享只接受本机网关生成的 PNG data URL。
- iOS 版只打包经过审核的三平台固定适配器，不导入或执行用户下载的 API 代码。
- 源码和构建脚本不会修改 Windows 端或 macOS 端目录。

## 发布前限制

官方 Node.js Mobile 最新 iOS 二进制仍是 v18.20.4，而 Node 18 已停止官方
安全维护。本工程固定哈希、只监听 loopback、缩小接口与依赖面，但这些措施
不能替代受维护的运行时。公开发布前应换成持续维护的 NodeMobile fork，
或把三平台适配迁到原生实现/受控 HTTPS 服务，并重新完成真实账号安全测试。
