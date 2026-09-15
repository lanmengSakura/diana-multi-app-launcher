# Issue #2 处理回执 · Beta.4 RC.5

感谢反馈 VS Code 识别、日间配色和 DeepSeek Harness 关联说明问题。本次已将修正纳入 [v0.1.0-beta.4-rc.5](https://github.com/lanmengSakura/diana-multi-app-launcher/releases/tag/v0.1.0-beta.4-rc.5)。

## 本次处理

- **VS Code 自动识别**：除了系统安装目录和用户安装目录，也会从 PATH 中的 `code.cmd` shim 回溯到对应的 `Code.exe`，兼容常见用户安装方式。
- **VS Code 日间主题**：检测 VS Code 当前 Profile；有 Profile 时写入 `User/profiles/<profile-id>/settings.json`，否则写入全局用户设置，避免只改全局文件而继续使用默认深色主题。
- **DeepSeek Harness 说明**：关联面板会明确要求选择项目根目录，而不是浏览器目录、文档目录或 `apps/web` 子目录。根目录需要同时含 `package.json` 与 `apps/web/package.json`；构建后还需有 `apps/cli/lib/bin.js` 与 `apps/web/dist/index.html`。

## 校验范围

本地源码校验通过：55 项 Rust 测试、1 项真实应用 smoke 保持忽略；TypeScript 类型检查、Rust 格式检查和差异检查通过。新增了 VS Code Profile 路径和 `code.cmd` 回溯的隔离测试。

这轮没有在反馈者的 Windows 11 / VS Code 1.136.2 环境直接启动 VS Code，也没有自动关闭正在运行的 VS Code；因此请更新 RC.5 后先完整退出 VS Code，再选择“日间”重新应用。如果工作区自身设置了 `workbench.colorTheme`，它仍可能覆盖用户级主题。

DeepSeek 仍需要用户自行准备源码、依赖、构建和模型配置；启动器不会捆绑上游源码、`node_modules` 或模型 Key，也不会自动改写第三方工作区。

Issue 保持开放，方便继续收集实际环境反馈。
