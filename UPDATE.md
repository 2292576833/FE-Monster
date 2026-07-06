# FE Monster 1.0.1-java26

Release date: 2026-07-07

## 更新内容

- 新增“书页歌词”场景预设：音乐封面固定在左侧，歌词在右侧以书页透视显示。
- 优化书页歌词同步：高亮从逐字符 DOM 更新改为当前行裁切推进，减少卡顿并提升与音乐进度的贴合度。
- 书页歌词现在归入“场景预设”，不再放在“文字预设”里，切换其他文字效果时会自动退出书页场景。
- 安装包运行时会检测 Java 26。缺少 Java 26 时先尝试通过 winget 安装 Eclipse Temurin 26 JDK，失败后自动下载 Temurin 26 JRE 到本地 `runtime\java`。
- 更新客户端版本号到 `1.0.1-java26`，用于社区更新服务和后台自动更新代理识别。

## 安装包

- Windows x64 安装包：`FE-Monster-Setup.exe`
- 安装时会复制客户端文件、检查 Node/WebView2/.NET/Java26、验证手势 Python 运行时依赖，并启动本地 Java 服务健康检查。

## 验证记录

```powershell
node --check web/app.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ensure-runtime-dependencies.ps1 -Root . -InstallMissing
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-installer.ps1
```
