# FE Monster 社区闭源模块安全方案

本文档用于约束 FE Monster 社区功能的开源/闭源边界，确保服务端能确认社区请求确实来自官方闭源模块，而不是被第三方逆向、篡改或冒用。

## 目标

- 开源部分只负责 UI、播放器、基础网络调用和原始数据传递。
- 社区敏感能力全部放入闭源库，包括签名密钥、加密盐值、设备指纹生成算法、防篡改校验、动态签名逻辑。
- 服务端只接受通过官方闭源模块动态签名的社区写请求。
- 闭源库被篡改、签名不可信或自检失败时，必须拒绝工作。

## 开源与闭源职责边界

### 开源部分可以包含

- 公开接口定义。
- 社区 UI 与基础交互。
- 原始请求数据收集，例如 `method`、`path`、`body`。
- 原始设备信号收集，例如机器 GUID、电脑名、用户名、系统版本、安装路径。
- 将原始数据传给闭源模块，并把闭源模块返回的签名头附加到请求中。

### 开源部分禁止包含

- AppKey 对应的服务端签名密钥。
- HMAC 密钥、加密盐值、设备指纹盐值。
- 最终设备指纹生成算法。
- 签名随机数与时间戳生成策略。
- 防篡改核心逻辑。
- 可被第三方直接复用来伪造合法社区请求的任何敏感实现。

### 闭源模块必须包含

- `AppKey` 和签名密钥。
- 设备指纹生成算法与盐值。
- 动态签名算法。
- 自身完整性校验逻辑。
- 被篡改后的拒绝工作逻辑。

## 公开接口层

开源部分依赖公开接口，闭源模块提供具体实现。

当前公开接口位于：

- `src/main/java/com/femonster/community/CommunityClient.java`
- `src/main/java/com/femonster/community/CommunityModule.java`
- `src/main/java/com/femonster/community/CommunityDeviceRequest.java`
- `src/main/java/com/femonster/community/CommunityRequest.java`
- `src/main/java/com/femonster/community/CommunitySignature.java`

闭源模块需要实现：

```java
package com.femonster.community;

public interface CommunityModule {
    boolean verifyIntegrity();

    String deviceFingerprint(CommunityDeviceRequest request);

    CommunitySignature sign(CommunityRequest request);
}
```

开源桥接层只调用接口：

- 启动时调用 `verifyIntegrity()`。
- 设备识别时调用 `deviceFingerprint(...)`。
- 社区 POST 请求发送前调用 `sign(...)`。

若 `verifyIntegrity()` 返回 `false` 或抛出异常，该闭源模块会被拒绝使用。

## 闭源模块加载方式

闭源模块以 jar 形式部署到：

```text
plugins/community/*.jar
```

jar 内需要提供 Java ServiceLoader 声明：

```text
META-INF/services/com.femonster.community.CommunityModule
```

文件内容为闭源实现类全名，例如：

```text
com.femonster.closed.OfficialCommunityModule
```

## 设备指纹要求

开源部分只传原始信号，不生成最终设备 ID。

当前原始信号包括：

- `windowsMachineGuid`
- `computerName`
- `userName`
- `osName`
- `osVersion`
- `osArch`
- `installRoot`
- `appVersion`

闭源模块负责：

- 组合原始信号。
- 加入闭源盐值。
- 生成稳定设备指纹。
- 返回符合格式的设备 ID。

返回值建议：

```text
[A-Za-z0-9_-]{16,128}
```

开源部分会继续沿用已有缓存的 `machine-id.txt`，避免升级后丢失原有账号绑定。没有缓存且没有闭源模块时，开源部分不再自行生成设备指纹。

为了让服务端管理后台始终能识别“这台已安装客户端”，没有闭源模块且没有历史 `machine-id.txt` 时，开源部分会生成一个本地安装实例 ID：

```text
install-<random-uuid-without-dashes>
```

该值只用于后台绑定和管理，不是硬件设备指纹，不包含密钥、盐值或硬件指纹算法。客户端会上报 `computerIdSource`：

- `official`：闭源模块生成的官方设备指纹。
- `cached`：沿用历史 `machine-id.txt`。
- `install`：开源部分生成的本地安装实例 ID。
- `server-assigned`：旧客户端未上报 ID 时，服务端为该客户端记录分配的管理 ID。

`install` 和 `server-assigned` 都不是官方硬件设备指纹，只用于服务端后台识别和绑定管理。正式防冒用仍以闭源模块的 `official` ID 与动态签名为准。

## 防篡改要求

闭源模块启动时必须先执行自检。

建议至少包含：

- 校验自身 jar 签名证书。
- 校验自身关键 class 或 native 库哈希。
- 校验发布公钥或证书指纹是否匹配官方值。
- 检测调试、注入、重打包、类替换等异常环境。
- 自检失败时 `verifyIntegrity()` 返回 `false` 或抛出异常。

自检失败后的行为：

- 不返回设备指纹。
- 不返回签名头。
- 不发起任何敏感社区请求。
- 可向开源侧返回普通错误，但不能泄露密钥、盐值或校验细节。

## 动态签名协议

闭源模块为社区写请求添加以下 HTTP 头：

```text
X-FE-App-Key
X-FE-Timestamp
X-FE-Nonce
X-FE-Signature
```

签名基串：

```text
METHOD + "\n" +
PATH + "\n" +
TIMESTAMP + "\n" +
NONCE + "\n" +
SHA256_HEX(BODY)
```

示例：

```text
POST
/api/community/messages/send
1783300000000
random-nonce
<body-sha256-hex>
```

签名算法：

```text
signature = BASE64URL(HMAC-SHA256(appSecret, signatureBase))
```

要求：

- `TIMESTAMP` 由闭源模块生成。
- `NONCE` 由闭源模块生成，必须足够随机。
- `appSecret` 只存在闭源模块中。
- 开源部分不能生成、保存或推导 `appSecret`。

## 服务端验签

服务端配置项：

- `officialApps`
- `security.requireOfficialSignature`

服务端验证规则：

- 根据 `X-FE-App-Key` 找到服务端保存的密钥。
- 重新计算签名基串。
- 使用 HMAC-SHA256 校验 `X-FE-Signature`。
- 校验时间戳有效期，当前窗口为 5 分钟。
- 校验 `nonce` 是否重复，防止重放。
- 强制校验开启后，签名缺失、过期、重复或无效均返回 `401`。

受保护接口：

```text
POST /api/community/register
POST /api/community/heartbeat
POST /api/community/listening
POST /api/community/friends/add
POST /api/community/messages/send
POST /api/community/likes/add
POST /api/community/listen/invite
POST /api/community/listen/respond
POST /api/community/listen/leave
POST /api/community/call/signal
POST /api/community/relay
```

管理接口不使用客户端闭源模块签名，仍由服务端管理后台控制。

## FE ID 与电脑 ID 绑定下发规则

FE ID 必须满足：

```text
10000000 <= FE ID <= 99999999
```

规则：

- FE ID 只能是 `10000000-99999999` 范围内的 8 位随机数字。
- 服务端生成 FE ID 时必须检查 `db.users`，不能重复。
- 后台手动修改 FE ID 时也必须检查范围和重复。
- `00000000`、`01234567`、非 8 位数字、非数字文本都不是合法 FE ID。
- 服务端下发徽章、清除徽章、推送更新等操作前，必须确认目标 FE ID 绑定了电脑 ID。
- 如果下发请求携带电脑 ID，该电脑 ID 必须与目标 FE ID 当前记录的电脑 ID 完全一致。
- 未绑定电脑 ID 的测试账号或异常账号不能接收服务端下发事件。

该规则用于避免仅凭 FE ID 冒用其他客户端，也避免后台把徽章或更新下发到错误设备。

## 服务端 UI 配置

服务器图形界面已提供：

- `AppKey`
- 密钥
- 强制校验社区写请求
- 保存签名配置

推荐启用步骤：

1. 部署闭源社区模块 jar 到客户端 `plugins/community/`。
2. 启动客户端，确认闭源模块自检通过。
3. 在服务端 UI 保存 `AppKey` 和服务端密钥。
4. 勾选“强制校验社区写请求”。
5. 测试发消息、点赞、一起听等社区写操作。
6. 确认未签名请求会被服务端拒绝。

## 兼容策略

当前默认：

```text
security.requireOfficialSignature = false
```

原因：

- 避免没有闭源模块时立刻阻断现有客户端。
- 允许先部署闭源模块，再切换强制校验。

正式发布时建议：

- 新版本客户端内置或附带闭源模块。
- 服务端先配置 AppKey 与密钥。
- 确认客户端全部升级后再开启强制校验。

## 验收清单

- 开源仓库内没有真实签名密钥。
- 开源仓库内没有设备指纹盐值。
- 开源仓库内没有最终设备指纹生成算法。
- 开源仓库内没有 HMAC 签名密钥。
- 闭源模块 `verifyIntegrity()` 失败时不会返回签名。
- 闭源模块 `deviceFingerprint(...)` 负责生成最终设备 ID。
- 闭源模块 `sign(...)` 负责生成 timestamp、nonce、HMAC 签名。
- 服务端开启强制校验后，未签名社区写请求返回 `401`。
- 服务端开启强制校验后，重复 nonce 请求返回 `401`。
- 服务端开启强制校验后，过期 timestamp 请求返回 `401`。
- 服务端开启强制校验后，签名 body 被篡改请求返回 `401`。

## 当前代码对应关系

- 开源公开接口：`src/main/java/com/femonster/community/`
- 开源桥接加载：`src/main/java/com/femonster/core/CommunityModuleBridge.java`
- 设备原始信号收集：`src/main/java/com/femonster/core/MachineIdentityService.java`
- 社区请求签名接入：`src/main/java/com/femonster/core/CommunityService.java`
- 服务端验签：`E:\FE moster server\server.js`
- 服务端图形配置：`E:\FE moster server\server-ui.ps1`
