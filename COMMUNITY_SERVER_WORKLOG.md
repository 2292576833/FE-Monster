# FE Monster 社区服务器与客户端互通改动说明

更新时间：2026-07-05 22:33

## 当前截图说明

截图里的内容：

```text
FE Monster community server is already running on port 3020.
Client connection URLs on this machine:
  http://172.19.0.1:3020
  http://192.168.31.246:3020
```

这不是报错，意思是本机 `3020` 端口已经有社区服务器在运行。
这时启动脚本不会再重复启动一个服务器，只会把客户端可连接地址打印出来。

局域网其他电脑优先使用：

```text
http://192.168.31.246:3020
```

`172.19.0.1` 通常是虚拟网卡地址，不建议给其他电脑使用。

## 已完成的事情

1. 客户端和服务器端拆开

服务器端不再跟随客户端自动启动。
客户端就是客户端，服务器端就是服务器端，两边通过 HTTP/SSE 通讯。

涉及位置：

- `E:\FE moster server\run.cmd`
- `E:\FE moster server\start-server.ps1`
- `E:\FE moster\scripts\launch-fe-monster.ps1`
- `E:\FE moster\scripts\stop-stale-fe-monster.ps1`

2. 本机启动服务器，其他电脑可连接

服务器启动后会监听：

```text
0.0.0.0:3020
```

所以同一个局域网内的其他电脑可以通过服务器电脑的局域网 IP 连接，例如：

```text
http://192.168.31.246:3020
```

客户端配置服务器地址：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "E:\FE moster\scripts\set-community-server-url.ps1" -Url "http://192.168.31.246:3020"
```

3. 服务器未启动时，客户端显示连接失败

客户端会检查：

```text
/health
```

只有返回 `ok: true` 且服务名是 `fe-monster-community` 时，才认为社区服务器可用。

服务器没开、地址配错、端口不通时，客户端会显示“服务器连接失败”，不会假装在线。

涉及位置：

- `E:\FE moster\src\main\java\com\femonster\core\CommunityService.java`
- `E:\FE moster\web\app.js`

4. 服务器记录客户端在线状态

客户端注册、心跳、听歌上报时，服务器会记录：

- FE ID
- 用户名
- 在线状态
- 最后在线时间
- 当前客户端 IP
- 当前听歌状态

服务器健康接口现在会带在线状态：

```text
http://127.0.0.1:3020/health
```

也可以在服务器电脑运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "E:\FE moster server\status.ps1"
```

5. 客户端之间可以通过服务器沟通

新增服务器事件通道：

```text
/api/community/events
```

客户端登录社区后会自动连接这个事件流。
当一个客户端发消息、加好友、点赞、发起一起听歌、发送连麦信令时，服务器会把事件推给对应客户端。

已支持通过服务器中转：

- 好友添加
- 在线好友状态刷新
- 私聊消息
- 点赞
- 一起听歌邀请
- 一起听歌同意/拒绝
- 连麦 WebRTC 信令

涉及位置：

- `E:\FE moster server\server.js`
- `E:\FE moster\web\app.js`

## 服务器启动方式

在服务器电脑上运行：

```cmd
E:\FE moster server\run.cmd
```

如果显示：

```text
FE Monster community server is already running on port 3020.
```

说明服务器已经在运行，不是失败。

如果刚更新过服务器代码，需要重启旧的服务器进程：

```cmd
taskkill /PID 260 /F
E:\FE moster server\run.cmd
```

如果 PID 不是 `260`，先查实际进程：

```powershell
Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -like '*FE moster server*server.js*' } | Select-Object ProcessId,CommandLine
```

## 其他电脑客户端连接方式

在其他电脑上，把客户端社区服务器地址设置为服务器电脑 IP：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "E:\FE moster\scripts\set-community-server-url.ps1" -Url "http://192.168.31.246:3020"
```

然后重新启动客户端。

如果其他电脑打不开，优先检查：

1. 两台电脑是否在同一局域网。
2. 服务器电脑防火墙是否放行 `3020` 端口。
3. 客户端配置的 IP 是否是服务器电脑当前局域网 IP。
4. 服务器电脑浏览器能否打开 `http://127.0.0.1:3020/health`。
5. 其他电脑浏览器能否打开 `http://192.168.31.246:3020/health`。

## 已验证

已做过这些验证：

- `server.js` 语法检查通过。
- `web/app.js` 语法检查通过。
- 临时服务器模拟两个客户端，A 发消息后 B 能通过服务器事件流收到 `message.sent`。
- Java 客户端构建通过。
- 社区服务器未启动时，客户端接口返回 `ok=false`、`serverOnline=false`。
- 已重新生成安装包：

```text
E:\FE moster\dist\FE-Monster-Setup.exe
```

## 注意事项

如果服务器窗口提示“already running”，它只是说明端口上已经有服务器进程。
但是如果这个进程是旧代码启动的，新增的实时事件流不会生效，需要结束旧进程再启动 `run.cmd`。

客户端互通依赖同一个社区服务器。
不同电脑如果连接到了不同服务器地址，就会出现搜不到 ID、收不到消息、好友状态不同步的问题。
