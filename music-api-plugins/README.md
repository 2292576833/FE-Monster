# FE Monster 音乐 API 插件

这些 ZIP 是独立导入包，不会内嵌进 FE Monster 安装包。

## 使用

1. 打开 FE Monster 的音乐登录窗口。
2. 点击“导入 API 插件”。
3. 选择 `dist/plugins` 中对应平台的 ZIP，只确认你信任的本地代码包。
4. 导入成功后，登录窗口会自动识别平台并创建切换按钮。
5. 选择平台，使用对应官方 App 扫描二维码。

登录窗口仅保留扫码登录。若插件未声明二维码能力，界面会明确显示不支持，而不会退回手机号或短信登录。

## 本地构建

```powershell
& .\music-api-plugins\netease\build.ps1
& .\music-api-plugins\qq\build.ps1
& .\music-api-plugins\kugou\build.ps1
& .\music-api-plugins\qishui\build.ps1
```

插件服务仅监听本机回环地址。各平台接口可能受登录状态、版权、地区限制或上游变更影响；请遵守平台条款与当地法律。
