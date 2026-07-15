# FE Monster 1.0.6-java26

Release date: 2026-07-15

## 更新内容

- 修复社区服务器关闭后客户端短时间仍显示在线的问题：成功状态不再使用宽限缓存，服务器停止后会立即切换为离线并禁用联网操作。
- 优化程序与场景预设运行性能：非活动页面、后台页面和未启用场景会停止无效渲染与轮询；实测隐藏页请求从 6 次降为 0，1800 方块同轮计算耗时降低约 75%。
- 完成 Android 本地客户端：界面、组件、预设、预览、纹理与可播放场景打入 APK，本地音乐导入、播放、内置预设和本地设置不依赖局域网或 FE Monster 服务端。
- Android 的社区与沙盒模式会真实检测服务器状态；离线时明确提示并阻止联网操作，服务器恢复后自动重新启用。
- Android 使用独立手机布局和性能样式，覆盖 320×568、360×800 竖屏与 800×360 横屏，触控目标不小于 44dp，避免顶部、播放栏、DIY、社区和沙盒控件重叠。
- Android 低性能档关闭高成本玻璃滤镜和实时阴影，降低粒子、反射缓冲与环境贴图预算；移动包不再携带不会被选择的 8K 纹理副本。
- Windows 桌面端现有按键布局、尺寸和位置保持不变；Android 适配仅注入 APK 专用 CSS/JS。

## 安装包

- Windows x64 单文件安装包：`FE-Monster-Setup.exe`。
- Android 可直接侧载安装包：`FE-Monster-Android-1.0.6-complete-debug.apk`。
- Windows 安装包内嵌完整载荷，安装时会检查 Node、WebView2、.NET、Java 26 与本地手势运行时。
- Android APK 使用调试签名，适合当前直接安装测试；正式商店发布仍需用户自有的长期发布密钥。
- 当前 Windows 安装包未做 Authenticode 代码签名，Windows SmartScreen 或杀毒软件可能显示未知发布者提示。

## Android 离线边界

- 无 FE Monster 服务端：可打开客户端、导入并播放本地音乐、使用内置场景/预设、保存本地设置。
- 需要 FE Monster 服务端：社区、组件/预设市场、沙盒、Codex 对话与 Blender 生成。
- 音乐平台账号登录与在线搜索需要互联网和可访问的音乐 API 网关；本地音乐播放不受影响。

## 验证记录

```powershell
cmd /c build.cmd
node --check web/app.js
node scripts/check-community-offline.mjs
node scripts/check-client-polish.mjs
node scripts/check-free-cubes.mjs
node scripts/check-preset-performance.mjs
node scripts/check-android-client.mjs
powershell -NoProfile -File scripts\check-storm-ocean-material.ps1
powershell -NoProfile -File scripts\build-android.ps1
powershell -NoProfile -File scripts\build-winforms-client.ps1 -Root .
powershell -NoProfile -File scripts\build-installer.ps1 -SkipBuild -EmbedPayload -AllowEmbeddedPayload
```
