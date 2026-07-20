# FE Monster 1.1.0

Release date: 2026-07-20

## 更新内容

- 新增三色半透明悬浮播放页：自动提取歌曲封面颜色，同时透出后方壁纸或场景。
- 播放页统一支持网易云、QQ 音乐、酷狗、汽水音乐与本地歌曲的平台身份、歌单、歌曲切换、可拖动进度和音质选择。
- 播放页歌词复用完整书页滚动逻辑，支持多行平滑滚动、到位高亮、宋体显示和独立颜色调节。
- 增强“焦点回声”文字预设的暗影层次，并为各文字预设保留独立调色盘。
- 修复壁纸模式的导入列表、实时壁纸与默认壁纸显示链路，主页面默认进入纯净壁纸模式。
- 完善音游模式的按键判定、节拍驱动与自定义音乐分析流程。
- 优化风暴海域、自由方块、Sonic 等预设的纹理、反射和低频响应，并加入自适应清晰度、刷新率与可选 FSR 档位。
- 优化低配电脑与小窗口下的渲染、歌词和播放页性能，保持桌面客户端既有主布局不变。
- Android 客户端继续使用独立本地资源和移动端布局，与 Windows 桌面端互不干扰。

## 安装包

- Windows x64 单文件安装包：`FE-Monster-Setup-1.1.0.exe`。
- 安装包内嵌完整载荷，安装时会检查 Node、WebView2、.NET、Java 与本地手势运行时。
- 本次 GitHub Release 发布 Windows 安装包；Android APK 仍通过独立构建流程生成。
- 当前安装包未做 Authenticode 代码签名，Windows SmartScreen 或杀毒软件可能显示未知发布者提示。

## 验证记录

```powershell
cmd /c build.cmd
node --check web/app.js
node scripts/check-text-preset-palette.mjs
node scripts/check-playback-lyric-palette.mjs
node scripts/check-qishui-phone-login-ui.mjs
node scripts/check-playback-card-performance.mjs
node scripts/check-playback-runtime-cache.mjs
node scripts/check-playback-cover-palette.mjs
powershell -NoProfile -File scripts\build-winforms-client.ps1 -Root .
powershell -NoProfile -File scripts\build-installer.ps1 -EmbedPayload -AllowEmbeddedPayload
```
