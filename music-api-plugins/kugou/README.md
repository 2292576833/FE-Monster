# FE Monster 酷狗音乐 API 插件

版本：2.0.1
上游：[MakcRe/KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi) `1.5.1`，源码提交 `283f1e97b110726b208a64b486a657c0fc0a6126`

这是重建后的酷狗适配器。它只监听 `127.0.0.1:3012`，由 FE Monster 使用内置 Node.js 启动。插件不再提供内嵌二维码 key/create/check 接口；用户在 FE Monster 中点击“打开官方扫码登录”后，由宿主打开酷狗官网登录页，并把登录成功后的酷狗域 Cookie 安全同步给本地插件。

## 导入和登录

1. 在 FE Monster 登录窗口点击“导入 API 插件”，选择构建出的 ZIP。
2. 切换到“酷狗音乐”，点击“打开官方扫码登录”。
3. 在酷狗官网页面扫码并确认。FE Monster 只读取 `kugou.com` 域的会话 Cookie，原始 Cookie 不会传回网页界面。

## 数据目录

宿主通过 `--data-dir=${data}/kugou-music-api` 分配独立数据目录。插件在其中原子写入 `session.json`，保存登录 Cookie、`dfid` 与匿名设备标识。请把该文件当作登录凭据保护，不要公开或提交到版本库。

## 能力

- 歌曲搜索、用户歌单、歌单详情与曲目读取
- LRC 歌词、歌曲评论读取，以及向已登录账号的歌单添加歌曲
- 标准完整音源解析；免费歌曲仍可正常播放
- 支持传统 32 位 hash、数字 album audio id，以及 `kg|hash|album_audio_id|album_id` 复合歌曲标识
- 接收 FE Monster 官方浏览器登录同步的会话，不暴露内嵌扫码登录端点

插件不会通过 `free_part` 请求试听片段来绕过账号权限。若上游只返回试听片段，接口会明确返回 `playable: false` 与 `type: "api"`。

## 稳定性与错误契约

只读且幂等的网络请求遇到瞬时网络故障时采用指数退避，最多尝试 3 次。登录、设备注册等非幂等流程不自动重试；酷狗业务错误也不重试。

错误 JSON 使用 `type: "api"` 或 `type: "network"`，并保留 `errorType` 兼容旧宿主。`/health` 返回 provider、版本、登录状态、`authMode: "official-browser-cookie"` 与能力列表，不会泄露 Cookie 或原始异常对象。

接口可能随酷狗上游变更而失效。音乐内容和账号能力仍受平台条款、版权、地区与账号权限限制。
