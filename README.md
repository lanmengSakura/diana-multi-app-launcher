# Diana Multi-App Launcher

嘉然 Diana 多应用主题启动器。当前公开版本为 **`v0.1.0-beta.3`**，仅面向 Windows 测试用户；安装器和便携版均未签名。

[八应用主题体验](https://diana-launcher-demo.szbluedream01.chatgpt.site/themes) · [启动器演示](https://diana-launcher-demo.szbluedream01.chatgpt.site) · [Codex 主题演示](https://diana-launcher-demo.szbluedream01.chatgpt.site/themes?app=codex) · [下载 Beta.3](https://github.com/lanmengSakura/diana-multi-app-launcher/releases/tag/v0.1.0-beta.3)

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

## 日间线稿源码修正（2026-09-06）

Cursor 与 DeepSeek Harness 的真实主题源已同步日间莓粉线稿修正，夜间及布局不变。Cursor 加载器校验兼容原先和修正版的两个精确清单指纹，仍逐个验证文件，不放宽未知版本或被修改文件的校验；机器专用适配器不在公开包内。DeepSeek 必须重新构建实际 ui-theme 模块并刷新页面，单改网页演示不生效。

此修正已进入源码和本机构建，尚未重新发布 Windows 安装包。

## 下载与使用

在 GitHub Releases 下载下列任一文件：

- `Diana-Multi-App-Launcher_0.1.0-beta.3_x64-setup.exe`：当前用户 NSIS 安装包；
- `diana-multi-app-launcher_0.1.0-beta.3_x64-portable.exe`：免安装便携版。

`v0.1.0-beta.1` 的 Windows 构建会因主题 CSS 换行转换触发 `SHA-256 mismatch`，请勿继续使用；该问题已在 Beta.2 修复。

首次使用建议：

1. 保存目标应用中的工作并正常退出目标应用。
2. 打开启动器，从底部列表选择应用。
3. 选择暗夜、日间或跟随系统，然后点击主按钮应用；这一步不是点击选项后立即切换目标应用。
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
| Cursor | 标准颜色主题；已登记本机适配器时可完整挂载 | 公开包不携带 Cursor 专用适配器；无登记时安全降级为颜色主题 |
| Grok Bot | 已登记本机适配器时可完整挂载 | 公开包不携带 Grok Bot 专用适配器；未登记或清单不匹配时拒绝接管 |
| DeepSeek Harness | 检测并启动本地源码部署 | 不捆绑上游源码、模型 Key 或用户资料 |
| ZCode | 版本限定的实验性完整美术挂载 | 当前只接受已验证的 `3.6.5.4145` 和有效签名；版本不符时拒绝开启端口 |

完整美术兼容性是“目标版本 + 运行时结构”联合条件，不按进程存在与否判断。只有结构、模式、交互与恢复检查均通过时，启动器才显示 `MOUNTED`。

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
```

也可在普通 Windows 命令提示符运行 `scripts\build-windows-public.cmd`。源码仓库不提交歌曲文件；只有在构建环境显式设置 `DIANA_HOPEFUL_DREAMER_AUDIO` 时才会把一份来源明确的本地音频编入产物。

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
