# 网易云登录保留说明

## 功能

现在网易云二维码登录成功后，账号登录态会保存到本地。关闭应用、退出客户端、重新打开后，不需要重新扫码，页面会自动恢复已登录状态并继续读取用户歌单。

## 使用方式

1. 启动最新版 FE Monster Java。
2. 点击右上角网易云登录按钮。
3. 使用网易云 App 扫描二维码并确认登录。
4. 登录成功后关闭窗口或退出应用。
5. 重新启动应用，右上角会自动显示已登录账号，歌单卡片会继续加载用户歌单。

## 保存位置

登录凭据保存在：

```text
data/netease-auth.json
```

这个文件只用于本地恢复网易云登录 cookie。不要把它上传、分享或提交到公开仓库。

## 如果没有自动登录

可以按下面顺序检查：

1. 确认使用的是最新构建后的应用。
2. 确认 `data/netease-auth.json` 存在。
3. 确认第三方网易云 API 服务正在运行。
4. 如果网易云登录过期，重新扫码一次即可刷新本地登录态。

## 开发改动位置

相关代码在：

```text
src/main/java/com/femonster/netease/NeteaseClient.java
src/main/java/com/femonster/core/AppContext.java
```

`NeteaseClient` 负责读取和写入登录 cookie，`AppContext` 负责把 `data/netease-auth.json` 路径传给网易云客户端。
