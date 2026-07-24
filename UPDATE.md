# FE Monster 1.1.6

Release date: 2026-07-24

## 更新内容

- 所有文字预设支持鼠标悬停滚轮独立缩放、拖动 360° 调整文字角度；Shift+拖动仍可在克拉尼场景中平移文字，双击文字恢复默认变换。
- 新播放栏新增双语歌词独立开关与多排歌词“多/单”切换；中文字幕更靠近主歌词并跟随主歌词调色板，多排模式只渲染当前附近歌词，未播放句子保持柔和模糊。
- 修复酷狗音乐歌单与播放地址解析，增强网易云、QQ、酷狗和汽水音乐的扫码登录、会话恢复与连接稳定性。
- 平台 API 改为用户导入插件模式；登录页会自动识别已导入平台，只保留扫码及官方浏览器登录入口。
- Google OBR 空间音频支持开关、5.1/7.1 布局与稳定重连；关闭空间音频后，播放链路会直接绕过 OBR。
- 一起听同步当前歌曲、播放状态和进度，自动跳过无音源或无权限歌曲，并改进关闭、左侧收起与服务器重连。
- 一起听弹幕使用玻璃气泡，支持鼠标排斥、随机漂浮和 3 秒自动消失。
- Sonic 增加分层音柱、核心/外围独立配色、喷泉粒子、星空粒子、亮度与曝光调节，并改善低频响应和相机视角。
- 粒子封面改为更平滑的 200 段低频波动，增加粒子数量、局部隆起、景深与双语歌词同步高亮。
- 优化歌单滚动、UI 隐藏动画、社区连接、固定画质下的 CPU/内存使用与桌面场景映射。
- 修复桌面窗口大圆角边缘、壁纸引擎/网页壁纸导入及播放栏玻璃材质布局。

## Windows 安装包

- Windows x64 单文件安装包：`FE-Monster-Setup-1.1.6.exe`。
- 默认安装到 `D:\FE Monster`；没有 D 盘时回退到当前用户的本地应用目录，也可在安装器中手动修改。
- 保留完整场景、字体、粒子和画质资源；仅移除 Python 测试、缓存和构建开发文件，并压缩安装器运行时以减小体积。
- 安装包包含应用所需的离线载荷与 Node.js 运行时，但不再内嵌任何音乐平台 API 实现。
- 当前安装包未做 Authenticode 代码签名，Windows SmartScreen 或杀毒软件可能显示未知发布者提示。

## API 插件

Release 附件提供四个可独立导入的 ZIP：

- 网易云音乐：`FE-Monster-Netease-API-Plugin-4.32.0.zip`
- QQ 音乐：`FE-Monster-QQ-API-Plugin-2.4.0.zip`
- 酷狗音乐：`FE-Monster-Kugou-API-Plugin-1.5.1.zip`
- 汽水音乐：`FE-Monster-Qishui-API-Plugin-1.0.0.zip`

在 FE Monster 登录页点击“导入 API 插件”，选择对应 ZIP。插件服务只监听本机回环地址；登录与播放能力仍受平台账号、版权、地区和上游接口可用性限制。请仅导入你信任的插件包，并遵守平台条款和当地法律。

默认本机端口分别为：网易云 `127.0.0.1:3010`、QQ `127.0.0.1:3011`、酷狗 `127.0.0.1:3012`、汽水 `127.0.0.1:3013`。ZIP 不需要手动解压；导入后登录页会自动显示对应平台切换按键，再选择扫码或官方浏览器登录。

## SHA-256

| Release 附件 | SHA-256 |
| --- | --- |
| `FE-Monster-Setup-1.1.6.exe` | `6254EDAFEB224CA2DE3FFD3EA23D9F41080BB59F4C17E327AD685F6393F19BE4` |
| `FE-Monster-Netease-API-Plugin-4.32.0.zip` | `37E485DECBD8664FE5EE8BBE5DA3329420A6000F4F564072546C897E3D1F2284` |
| `FE-Monster-QQ-API-Plugin-2.4.0.zip` | `7309D51F065045FE4CB1119874B93822F2B04A37565DF0F778A13D86CA9D9EBF` |
| `FE-Monster-Kugou-API-Plugin-1.5.1.zip` | `F3EBCCDB28F163CD16791AF1B8454BEBB6BE3511D166E0137BC745BFFFBA7213` |
| `FE-Monster-Qishui-API-Plugin-1.0.0.zip` | `C64438BA128EBC973CB8414B1A9F4C5DACE1C6F9F8426572E5D232FC4A3D1F01` |

## 验证

```powershell
cmd /c build.cmd
node --check web/app.js
node scripts/check-music-api-import.mjs
node scripts/check-kugou-plugin-playback.mjs
node scripts/check-google-obr-runtime.mjs
node scripts/check-community-listen-playback.mjs
node scripts/check-fixed-quality-performance.mjs
powershell -NoProfile -File scripts\build-winforms-client.ps1 -Root .
powershell -NoProfile -File scripts\build-installer.ps1 -EmbedPayload -AllowEmbeddedPayload
```
