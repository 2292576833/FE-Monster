FE Monster QQ 音乐 API 插件 2.4.0

导入方法：
1. 打开 FE Monster 登录窗口。
2. 点击“导入 API 插件”，选择本 ZIP，并确认只导入可信包。
3. 登录窗口会自动识别“QQ音乐”并添加切换按钮。
4. 使用 QQ 音乐 App 扫描二维码登录。

说明：
- 插件服务只监听本机 127.0.0.1:3011。
- 登录会话只保存在本机；当前存储未加密，请保护好系统账户和 FE Monster 数据目录。
- Windows 与 macOS 共用同一个插件包；macOS 数据写入“~/Library/Application Support/FE Monster”。
- 游客状态可能无法取得播放地址，完整播放能力通常需要扫码登录。
- 上游 API 没有可靠的歌单写入接口，因此不保证“添加到歌单”功能。
- 本插件基于 @sansenjian/qq-music-api 2.4.0，仅用于个人学习与研究；请遵守平台条款和当地法律。
