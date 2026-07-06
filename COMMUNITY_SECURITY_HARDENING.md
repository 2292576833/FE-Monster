# FE Monster 社区安全加固说明

本文记录社区服务端与闭源社区模块的安全边界。开源仓库不得保存真实 AppKey 密钥、HMAC 密钥、设备指纹盐值、证书私钥或最终设备指纹算法。

## 本次已落地

### 1. 通讯层

- `E:\FE moster server\server.js` 已支持可选 HTTPS。
- 配置以下环境变量后，服务端会从 `http.createServer` 切换到 `https.createServer`：
  - `FE_MONSTER_TLS_KEY`：服务端私钥路径。
  - `FE_MONSTER_TLS_CERT`：服务端证书路径。
  - `FE_MONSTER_TLS_CA`：客户端证书 CA 路径，可选。
  - `FE_MONSTER_TLS_REQUIRE_CLIENT_CERT=true`：启用 mTLS，TLS 层要求客户端证书。
- 服务端安全配置支持：
  - `requireHttps`：社区 API 必须走 HTTPS。
  - `requireMtls`：社区 API 必须携带有效客户端 TLS 证书。

SSL Pinning 必须由客户端闭源模块实现，锁定服务端证书或公钥；服务端无法替客户端完成 Pinning。

### 2. 请求层

- 社区写请求继续使用动态签名头：
  - `X-FE-App-Key`
  - `X-FE-Timestamp`
  - `X-FE-Nonce`
  - `X-FE-Signature`
- 服务端按 `METHOD + PATH + TIMESTAMP + NONCE + SHA256(BODY)` 重算 HMAC-SHA256。
- 时间戳窗口为 5 分钟。
- nonce 会被缓存，重复 nonce 直接返回 `401`。
- nonce 增加格式与长度校验，异常 nonce 直接拒绝。

### 3. 身份层

- Java 客户端社区写请求会自动带上：
  - `computerId`
  - `computerIdSource`
- 服务端会校验 FE ID 与已绑定电脑 ID 是否一致。
- 注册时如果同一账号已有电脑 ID，新请求上报了不同电脑 ID，会返回 `401`。
- 徽章、清除徽章、更新推送等服务端下发逻辑仍要求目标 FE ID 已绑定电脑 ID。

当前项目没有完整账号密码登录和 JWT 签发链路，因此短期 Access Token + Refresh Token 需要在后续身份服务中补齐。现阶段先以“官方闭源签名 + FE ID/电脑 ID 绑定”降低冒用风险。

### 4. 服务端硬防御

- 社区 POST 请求增加字段白名单，多余字段默认报错。
- FE ID 必须是 `10000000-99999999` 范围内的 8 位数字。
- 文本长度、消息长度、简介长度、song/payload 大小均做限制。
- 服务端业务函数仍以数据库中的真实用户记录为准，不信任客户端随意传来的目标状态。
- 当前存储是 JSON 文件，不拼接 SQL；如果后续接入 SQL/NoSQL，必须使用预编译或 ORM。

### 5. 风控与监控

- 所有 `/api/` 请求默认按 IP 做 10 次/秒限流，可由 `security.rateLimitPerSecond` 调整。
- 官方签名请求会额外按 `AppKey + IP` 限流。
- 请求体包含明显 SQL/NoSQL/脚本注入特征时会被拦截。
- 同一 FE ID 在 5 分钟内切换到 3 个及以上 IP，会进入临时风控封禁。
- 风控封禁默认持续 15 分钟。
- 服务端命令窗口会输出限流、封禁、事件投递、上下线等日志。

## 仍需闭源模块实现

- SSL Pinning：闭源模块必须锁定服务端证书或公钥。
- AppKey 和 HMAC 密钥保护：真实密钥只能存在闭源模块或服务端配置中。
- 动态签名生成：时间戳、nonce、HMAC 签名全部由闭源模块生成。
- 设备指纹算法：盐值和最终设备 ID 生成算法必须留在闭源模块。
- 防篡改：闭源模块启动时校验自身签名、关键 class/native 哈希和运行环境，失败则拒绝签名和拒绝返回设备指纹。
- mTLS 客户端证书：官方客户端证书应由闭源模块或安全安装器管理，避免暴露给开源部分。

## 部署要求

1. 给服务端配置 HTTPS 证书和私钥。
2. 如果启用 mTLS，配置客户端证书 CA，并设置 `FE_MONSTER_TLS_REQUIRE_CLIENT_CERT=true`。
3. 客户端闭源模块内置或安全加载客户端证书。
4. 服务端后台保存 AppKey 和服务端 HMAC 密钥。
5. 所有客户端升级到带闭源模块和电脑 ID 上报的版本后，再启用 `requireOfficialSignature`、`requireHttps`、`requireMtls`。

## 验收清单

- 未签名社区写请求返回 `401`。
- 重复 nonce 返回 `401`。
- 过期 timestamp 返回 `401`。
- 篡改 body 后签名不匹配返回 `401`。
- FE ID 与电脑 ID 不匹配返回 `401`。
- 多余字段默认返回错误。
- 单 IP 超过限流阈值返回 `429`。
- 可疑注入载荷返回 `403` 并进入临时风控。
- 配置 HTTPS 后 `/health` 返回 `protocol: "https"`。
- 配置 mTLS 后，无客户端证书的请求在 TLS 层或社区 API 层被拒绝。
