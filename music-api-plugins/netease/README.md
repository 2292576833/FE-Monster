# FE Monster 网易云音乐 API 插件

这是供 FE Monster 1.8.8 导入的离线、自包含 API 插件。导入后，FE Monster 会优先使用应用自带的 Node.js，并在开发环境回退到系统 Node.js，在本机 `127.0.0.1:3010` 启动服务。

插件仅在本机运行，不内嵌账号二维码。登录时 FE Monster 会打开网易云音乐官网的登录页面，并只把该官网会话同步到本机。

## 导入

在 FE Monster 的 API 插件管理界面选择 `FE-Monster-Netease-API-Plugin-4.32.0.zip`。不要手动解压外层 ZIP。

本插件使用社区项目 NeteaseCloudMusicApi 4.32.0，仅供学习和个人用途。请遵守网易云音乐服务条款及所在地法律。
