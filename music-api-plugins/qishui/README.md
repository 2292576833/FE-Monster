# FE Monster 汽水音乐 OpenAPI 插件

这是汽水音乐的合规最小接入，只调用抖音开放平台公开文档中的汽水音乐
“首页推荐”接口：

`POST https://open.douyin.com/api/luna/v1/platform/feed/song-tab/`

所需 scope：`luna.openapi.platform.play_core`。

## 能力边界

- 登录界面接收由开发者自己的抖音开放平台应用取得的 `access_token`。
- 可选保存 `client_key + refresh_token`；官方明确报告 access token 过期时，
  插件会调用官方 OAuth 刷新接口一次并重试。撤权、scope 收回或 refresh token
  过期时仍须重新授权。
- “搜索”只在官方首页推荐本次返回的授权歌曲元数据中本地过滤；它不是全库搜索。
- 播放只接受官方响应 `player_info.full.video_model_info.url_player_info`
  中直接返回的 HTTPS 完整音源。
- 不使用试听地址代替完整音源，不解析 opaque player info，不解密、不绕过
  DRM、会员、付费或地域限制。
- token、scope、应用状态或用户授权失效时，插件会明确返回不可用；外部授权
  无法由本地客户端保证永久有效。
- 本地 SodaMusic 只做安装/运行检测，以及固定路径
  `%APPDATA%\SodaMusic\LunaStorage\QueueCache` 的只读白名单解析。该文件必须是
  4 字节 ASCII `LUNA` 头加 gzip JSON，并受压缩大小、解压大小、JSON 深度、
  节点数和歌曲数上限约束；不符合即关闭本地队列能力。
- 本地缓存只提取官方 ID、标题、歌手、专辑、时长与 HTTPS 封面，并自动显示为
  “本地播放队列”。`bit_rates`、`audition_info`、Cookie、token、session 和任何
  播放 URL 都会被丢弃。登录状态仍明确显示为 `unknown`。
- 未登录 OpenAPI 时仍可搜索本地播放队列或用户主动导入的歌单元数据；播放仍需
  官方授权 feed 重新匹配并返回完整音源，绝不直接播放缓存中的地址。

## 可见歌单元数据适配器

导入文件 schema 为 `fe-monster.qishui-library/v1`：

```json
{
  "schema": "fe-monster.qishui-library/v1",
  "playlists": [
    {
      "id": "visible-playlist",
      "name": "我的可见歌单",
      "tracks": [
        {
          "id": "optional-official-id",
          "title": "歌曲标题",
          "artist": "歌手",
          "album": "专辑",
          "duration": 215
        }
      ]
    }
  ]
}
```

适配器拒绝 token、Cookie、session、密码、secret 和音源 URL 字段。点击歌曲后，
匹配顺序为官方 ID，其次是严格的“标题 + 歌手 + 时长（误差不超过 3 秒）”；
匹配失败即不可播放。

## 构建

在仓库根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File music-api-plugins/qishui/build.ps1
```

产物为 `dist/plugins/FE-Monster-Qishui-OpenAPI-Plugin-3.1.0.zip`。
