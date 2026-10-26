# Diana for DeepSeek Harness Desktop

本机候选版，适配官方签名桌面端 **0.2.1-rc.3**。

通过 Harness 的官方插件机制加载，不修改安装目录、app.asar 或签名，
不启动调试端口，不访问模型、会话内容、文件、账号凭据或网络。
插件仍是会在应用内执行的第三方代码，仅安装可信来源。

在“插件 → 添加插件”选择本文件夹，安装后启用 **dsh-diana-theme**。
日间、暗夜与跟随系统使用 Harness 原生“设置 → 外观”，不改写用户偏好。
在插件列表禁用本插件即可撤掉美术和配色；卸载可移除安装副本。
美术只有本地内嵌素材；未匹配到本版对话框架时不向未知窗口添加装饰。

源文件在 `plugins/diana-deepseek-desktop`，运行
`node scripts/build-deepseek-plugin.mjs` 生成可安装目录：
`src-tauri/resources/theme-packs/deepseek/desktop-plugin`。
