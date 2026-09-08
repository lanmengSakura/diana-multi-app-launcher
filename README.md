# Diana Multi-App Launcher

嘉然 Diana 多应用主题启动器。当前公开测试版本为 **`v0.1.0-beta.4-rc.4`**，仅面向 Windows 测试用户；安装器和便携版均未签名，不代表八目标全部场景已完成认证。

RC.4 修复未安装 Codex 时的高频检测阻塞，加入重复启动保护，并补齐路径、版本与便携构建说明。**已有 rc.3 EXE 需手动更新**。详情见 [Issue #1 处理回执](docs/ISSUE_1_RECEIPT.md) 与 [技术修正范围](docs/ISSUE_1_FOLLOWUP.md)。

[八应用主题体验](https://diana-launcher-demo.szbluedream01.chatgpt.site/themes) · [启动器演示](https://diana-launcher-demo.szbluedream01.chatgpt.site) · [Codex 主题演示](https://diana-launcher-demo.szbluedream01.chatgpt.site/themes?app=codex) · [下载新版测试版](https://github.com/lanmengSakura/diana-multi-app-launcher/releases/tag/v0.1.0-beta.4-rc.4)

**完整功能由你选择启用。** 本启动器公开提供完整挂载组件；下载、安装、打开或关联应用位置不代表同意调试连接。Codex、Cursor、Grok Bot、ZCode 新开实验调试会话前会告知风险并等待确认，取消不会执行本次挂载。回环端口没有身份认证，同机进程可能读取界面、执行脚本或截图；仅关闭启动器或撤下皮肤不会关闭目标应用持有的端口，须完整退出目标应用。请先看 [风险与退出方法](SECURITY.md)。

网页复用 EXE 的定稿美术和界面代码，可体验连接臂展开/隐藏、按钮交互、外发光和音乐粒子。**网页中的挂载、版本与进程状态都是模拟，不检测或操作访客的本机应用。** 模拟成功不代表本机兼容。

点击网页启动器的主按钮，会进入选中应用的主题演示，并带上日间/暗夜选择；恢复按钮进入原版参考。主题页可继续切换配色、场景和应用，也可返回启动器。Codex 复用原桌面演示母版，Grok Bot 与 ZCode 根据已有实机截图还原界面结构，所有正文均为新的示例内容。

| 应用主题演示 | 应用主题演示 |
|---|---|
| [Codex](https://diana-launcher-demo.szbluedream01.chatgpt.site/themes?app=codex) | [豆包浏览器](https://diana-launcher-demo.szbluedream01.chatgpt.site/themes?app=doubao) |
| [Cursor](https://diana-launcher-demo.szbluedream01.chatgpt.site/themes?app=cursor) | [Grok Bot](https://diana-launcher-demo.szbluedream01.chatgpt.site/themes?app=grok) |
| [ZCode](https://diana-launcher-demo.szbluedream01.chatgpt.site/themes?app=zcode) | [VS Code](https://diana-launcher-demo.szbluedream01.chatgpt.site/themes?app=vscode) |
| [Windows Terminal](https://diana-launcher-demo.szbluedream01.chatgpt.site/themes?app=terminal) | [DeepSeek Harness](https://diana-launcher-demo.szbluedream01.chatgpt.site/themes?app=deepseek) |

终端仅展示已有暗夜主题；原版参考是网页重建，不是真实客户端。演示使用正式主题 CSS/素材，不捆绑用户会话或目标应用运行时，完整美术演示不等于公开包自动提供完整挂载能力。说明见 [网页主题演示](demo/THEME_DEMOS.md)。已发布的 Windows Beta.3 安装包不会随网页或源码提交自动更新。

> 这是非商业同人项目，不隶属于 OpenAI、A-SOUL、字节跳动、Microsoft、Anysphere、DeepSeek 或 ZCode。Beta 版可能因目标应用更新而拒绝挂载；拒绝旧适配器属于安全行为，不代表目标应用损坏。

## 首次交付说明

使用前请看 [对应入口、依赖、恢复方式与测试范围](DELIVERY.md)。本版补齐 Cursor / Grok Bot 的可分发完整运行组件，修复 Cursor 跟随系统时的明暗混用；需要手动下载更新，不会自动替换旧 EXE。已测范围与剩余限制见 [本次发布说明](RELEASE_NOTES.md)。

rc.3 新增状态栏旁的“关联”入口，可手动选择并记住应用位置；rc.2 及更早 EXE 需手动下载更新才能获得此入口。使用方式与检查范围见 [本机应用关联](APP_ASSOCIATION.md)。

## 日间线稿源码修正（2026-09-06）

Cursor 与 DeepSeek Harness 的真实主题源已同步日间莓粉线稿修正，夜间及布局不变。Cursor 加载器校验兼容原先和修正版的两个精确清单指纹，仍逐个验证文件，不放宽未知版本或被修改文件的校验；机器专用适配器不在公开包内。DeepSeek 必须重新构建实际 ui-theme 模块并刷新页面，单改网页演示不生效。

此修正已包含在本次 rc.2 Windows 安装版与便携版中。DeepSeek 的实际源码部署仍须自行构建，不能由启动器里的演示代替。

## 下载与使用

在 GitHub Releases 下载下列任一文件：

- `Diana-Multi-App-Launcher_0.1.0-beta.4-rc.4_x64-setup.exe`：当前用户 NSIS 安装包；
- `diana-multi-app-launcher_0.1.0-beta.4-rc.4_x64-portable.exe`：免安装便携版。

`v0.1.0-beta.1` 的 Windows 构建会因主题 CSS 换行转换触发 `SHA-256 mismatch`，请勿继续使用；该问题已在 Beta.2 修复。

首次使用建议：

1. 保存目标应用中的工作并正常退出目标应用。
2. 打开启动器，从底部列表选择应用。未自动找到位置时，点击状态栏旁的“关联”选择程序并保存。
3. 选择暗夜、日间或跟随系统；点击选项或保存关联不会立即挂载。
4. 点击主按钮；若出现实验性调试连接说明，阅读后自行决定是否继续。
5. 需要撤下时使用右侧恢复入口。Codex 与豆包标为“原版启动”；Codex 需要完整退出后再普通重开，不是即时热切换。其他目标按状态提示操作；撤下美术不等于临时调试端口已关闭。

Windows SmartScreen 可能提示“未知发布者”，因为当前 Beta 没有代码签名证书。请只从本仓库 Release 下载，并核对发布页给出的 SHA-256。

## 当前目标

| 目标 | Beta 形态 | 重要边界 |
|---|---|---|
| Codex Desktop | 原生配色 + 实验性完整美术挂载 | 每次确认后才使用 `127.0.0.1` 随机高位调试端口；先做运行时能力探测，不修改 MSIX/WindowsApps |
| 豆包 | Manifest V3 用户态扩展与专用入口 | 不开启调试端口，不读取登录态，不修改安装目录 |
| Windows Terminal | 用户级 Fragment、独立配置和恢复脚本 | 不创建后台进程；默认配置只在用户明确选择时改变 |
| Visual Studio Code | 标准 Diana Day/Night 颜色主题 | 不修改 VS Code 安装资源 |
| Cursor | 内置版本限定完整适配器，另有标准颜色主题 | 当前限 3.17.21 与指定有效签名；需要 Node.js 22+，逐次确认调试风险 |
| Grok Bot | 内置版本限定完整适配器 | 当前限 0.28.0 与指定有效签名；需要 Node.js 22+，逐次确认调试风险 |
| DeepSeek Harness | 检测并启动本地源码部署 | 不捆绑上游源码、模型 Key 或用户资料 |
| ZCode | 版本限定的实验性完整美术挂载 | 当前只接受已验证的 `3.6.5.4145` 和有效签名；版本不符时拒绝开启端口 |

完整美术兼容性是“目标版本 + 运行时结构”联合条件。挂载操作会核验渲染结果；后续状态主要依据本次成功记录与对应进程，不是持续截图或逐项人工验收。页面重载、应用更新或恢复流程仍需实际复核，`MOUNTED` 不代表所有交互与恢复测试均已完成。

### 常见误会

- **不要求八款应用全部安装。** 只选自己安装的应用；没有 Codex 不应影响豆包等其他入口。RC.4 已修复缺少 Codex 时的高频检测阻塞。新安装/更新后可用“关联 → 重新检测”立即刷新位置。
- **关联成功不等于版本受支持。** 完整挂载限定为 Cursor `3.17.21`、Grok Bot `0.28.0`、ZCode `3.6.5.4145`。例如 ZCode `3.11.2.6792` 不在当前范围；不会通过关闭校验来强行挂载。请等待对应适配更新，或继续使用原版。
- **豆包小窗口可能只显示角落线条。** 扩展视口宽度不超过 1320 CSS 像素时隐藏立绘；宽度不超过 900 或高度不超过 560 时，还会隐藏左下简笔画和上方装饰。放大窗口、留足正文空间后再看；Windows 缩放会影响实际 CSS 视口，不能只看显示器分辨率。这是防遮挡策略，不一定是挂载失败。
- **免安装不等于不使用本机目录。** 便携 EXE 与安装版的启动器主体相同，仍使用 WebView2 和用户目录保存关联/主题运行文件。无需把 NSIS 安装包再包成便携版。

## 实验性调试连接

Codex、Cursor、Grok Bot 与 ZCode 的完整美术可能需要 Chromium 调试连接。启动器会在每次操作前说明风险并等待确认：

- 只允许 `127.0.0.1`/回环地址和随机高位端口，拒绝 `0.0.0.0`、局域网地址及所有者不匹配的监听；
- 同一 Windows 账户下的其他本地进程仍可能发现未认证端口，读取当前可见界面、执行渲染页脚本或截图；
- 临时 Node/PowerShell 适配进程完成探测与挂载后退出，但端口由目标应用进程持有；
- 撤下 CSS 不等于关闭端口，必须完整退出本次带调试参数的目标应用；
- 不创建 watcher、服务、计划任务、登录启动项或隐藏常驻进程；
- 不修改目标 EXE、`app.asar`、WindowsApps、签名或用户登录态；
- 日志只记录版本、PID、状态和脱敏错误，不记录会话正文、代码、DOM、截图、Cookie、令牌或 WebSocket 地址。

详见 [SECURITY.md](SECURITY.md) 与 [PROTOTYPE-BOUNDARY.md](PROTOTYPE-BOUNDARY.md)。

## 音乐按钮

公开 `beta.2` 构建内置 2 分 32.5 秒的《Hopeful Dreamer》粉丝向歌词循环，按钮默认关闭，点击播放、再次点击暂停，默认音量为 34%。音频只从 EXE 内的本地字节播放，不访问网络、不扫描用户音乐目录，也不提供单独导出入口。

本项目依据官方开放的粉丝二创授权，以非商业、无盈利同人作品形式使用；MIT License 只覆盖代码，不覆盖歌曲录音、角色或美术。禁止把该录音从本项目拆出后单独传播或用于商业用途。

## 从源码构建

需要 Node.js、Rust stable-msvc、Microsoft C++ Build Tools、Windows SDK 和 NSIS。确认这些工具已在当前终端可用后执行：

```powershell
npm ci
npm run build
npm run qa:interactions
cargo fmt --manifest-path .\src-tauri\Cargo.toml --check
cargo test --manifest-path .\src-tauri\Cargo.toml
npm run tauri:build
npm run package:windows
```

也可在普通 Windows 命令提示符运行 `scripts\build-windows-public.cmd`，构建结束后自动导出到新建的 `artifacts/local-packages-版本-时间/`。目录包含便携 EXE、匹配版本的 NSIS 安装包（如已构建）和 `SHA256SUMS.txt`；不覆盖旧产物、不安装、不上传。便携版是 `release/diana-codex-launcher.exe` 的逐字节副本，不需要另一套构建源码。

默认查找 `src-tauri/target/release`；配置 `CARGO_TARGET_DIR` 时使用该目录下的 `release`。自定义工具链/架构输出可显式运行 `npm run package:windows -- --release-dir "<实际 release 目录>" --out "<新的导出目录>"`，也可用 `--binary`、`--setup` 指定文件。请在同一终端刚完成构建后导出，发布前更新版本并检查成品，避免把旧构建重新命名。导出校验确认复制完整性，**不证明不同机器/工具链产物具有相同哈希**。

源码仓库不提交歌曲文件；构建器可从忽略提交的私有音频目录或 `DIANA_HOPEFUL_DREAMER_AUDIO` 读取获准使用的本地配乐。普通无音频构建可正常使用其他功能，但不等同于内置配乐的公开 EXE，哈希也不会相同。音频来源与使用限制见 [私有音频构建说明](src-tauri/private-assets/README.md)。

不打开目标应用的检查：`npm run qa:delivery`、`npm run qa:demo:routing`、`npm run build`、`cargo test --manifest-path src-tauri/Cargo.toml --lib --locked`。真实应用启动烟测默认忽略，不要为普通源码检查添加 `--ignored`。

## Beta 反馈

### 本地运行网页演示

```powershell
npm ci
npm run dev:demo
# 打开终端给出的 127.0.0.1:1422 地址
npm run qa:demo
npm run build:demo
```

网页与桌面共用 `src/` 和 `public/assets/`，浏览器专用模拟桥位于 `demo/`，不会进入 EXE。无音频构建仍可体验其他功能；要试听，构建/启动前用 `DIANA_HOPEFUL_DREAMER_AUDIO` 指向获准使用的 M4A。静态网页输出位于 `site-build/dist/client`，不会覆盖 Tauri 的 `dist`。详情见 [demo/README.md](demo/README.md)。

### 报告问题

提交 Issue 时请提供：启动器版本、Windows 版本、目标应用版本、操作阶段及脱敏后的错误码。不要上传会话截图、Cookie、令牌、WebSocket 地址或含私人路径的状态文件。

代码采用 [MIT License](LICENSE)。嘉然、阿草及相关 A-SOUL 派生美术不属于 MIT，且仅用于非商业同人创作，详见 [ASSET_LICENSES.md](ASSET_LICENSES.md)。
