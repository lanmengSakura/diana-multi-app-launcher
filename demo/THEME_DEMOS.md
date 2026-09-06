# 应用内主题演示

公开入口：https://diana-launcher-demo.szbluedream01.chatgpt.site/themes

八种应用统一在主题体验页中选择。启动器主按钮进入选中应用的主题页，恢复按钮进入原版参考；日夜选择通过 URL 传递，跟随系统在启动时解析。终端没有日间主题，日间请求统一回落至暗夜。

## 范围

| 应用 | 页面与交互 | 正式素材来源 |
|---|---|---|
| Codex | 原演示母版、任务树、会话、环境面板、日夜 | `diana-codex-theme/preview/`，复用本仓库共享美术 |
| 豆包浏览器 | 浏览器栏、历史、聊天、输入框、日夜 | 本仓库 `theme-packs/doubao/extension/diana.css` |
| Cursor | Agent 工作台、仓库列表、右侧工具、输入框 | `diana-cursor-theme/visual-blueprint/diana-cursor.css` |
| Grok Bot | 联系人列表、搜索、左右气泡、底部输入、右下圆弧 | `diana-grok-bot-theme/visual-blueprint/diana-grok-bot.css` |
| ZCode | 项目树、首页输入与模板卡片、任务会话、左导轨、Git 工具 | 本仓库 `theme-packs/zcode/runtime/theme.css` |
| VS Code | 文件树、代码、标签、终端面板、日夜 | 本仓库 `theme-packs/vscode/visual-layer/diana-workbench.css` |
| Windows Terminal | PowerShell/CMD 标签、暗夜、预设命令 | 本仓库 Terminal Fragment 与 `diana-terminal-bg-v2.png` |
| DeepSeek Harness | 工作区、会话、详情栏、日夜 | 本仓库 `theme-packs/deepseek/diana.css` |

`theme-packs/` 相对于 `src-tauri/resources/`。Diana 美术直接从已有 `theme-preview/assets/` 导入，由 Vite 输出为共享哈希资源；没有按应用重复提交位图。终端复用已存在的独立合成背景。

Cursor/Grok 的 CSS 只复制公开视觉蓝图，不复制适配器。Cursor 日间素材映射使用已定稿的 `diana-corner-cutout-v2.png`。其余样式直接导入本仓库发布资源。`theme-app.css` 负责重建原生界面和已知容器尺寸，代替本机测量逻辑；不运行 CDP、PowerShell 或任何挂载程序。

## CSS 源文件溯源

新增在 `demo/theme-sources/` 的蓝图最初复制来源 SHA-256：

- `cursor.css`：`697325613823578821d9a4c795d6576b1a23a4703b29ee3561321716a1858508`
- `grok.css`：`0dad28bd7eeb5ecc11e7ef3f9592e5d29a21e98db1cbc8b7b3ca5171f875bac7`

对应公开源仓库：[Cursor](https://github.com/lanmengSakura/diana-cursor-theme)、[Grok Bot](https://github.com/lanmengSakura/diana-grok-bot-theme)。结构参考还包括已有 ZCode/Terminal 静态预览，以及 DeepSeek Harness 的 AppFrame/Sidebar 布局；本页宿主代码为独立示例实现，没有复制上游组件运行时。

2026-09-06 日间校色：Cursor 与 DeepSeek 左侧简笔画改用原始透明线稿蒙版着色，沿用莓粉 `#b85f7c`，透明度改为 `0.62`。Cursor 保留顶部渐隐，DeepSeek 的日夜共用同一组尺寸/位置变量，所有断点保持原布局。夜间与其他装饰不变，不新增图片，不更新 EXE；上面的 Cursor 校验值记录初始来源，不是校色后的文件值。

## 使用与边界

2026-09-06 统一交互与结构校准：

- Codex 母版来自公开仓库 `63cfe16` 的 `preview/index.html`、`preview.css`、`preview.js`，对应本目录 `codex.html`、`codex-preview.css`、`codex-preview.js`。只增加演示协议、起始页、原版参考与本页消息交互，未复制位图。旧 GitHub Pages 演示保留不变。
- Grok 布局参考已存档的 `dark-doodle-final-1788235704533.png`：280px 联系人栏、53px 会话栏、紧凑左右气泡、通栏胶囊输入框。
- ZCode 布局参考已存档的 `zcode-live-mounted-dark.png` 与 `zcode-live-workspace-current.png`：266px 项目栏、首页任务模板、会话左导轨与右侧 Git 工具。水印沿用已有 ZCode 静态样板的构造。
- 上述实机截图只供本地观察，没有复制进仓库或发布产物。用户名、联系人、任务标题与正文均替换为虚构示例；没有重新打开应用截图。
- 对应 README 直接链接 `themes?app=<应用标识>`。统一标识为 `codex/doubao/cursor/grok/zcode/vscode/terminal/deepseek`；启动器内部 `grokbot` 通过目录表转换为 `grok`。

- 默认 1600 × 960 桌面画幅适应窗口；可选择 1200 × 820 或 1:1 滚动查看。单独打开时使用浏览器实际窗口宽度。
- 日夜切换保留当前草稿与会话滚动位置。应用切换会重新载入该应用的预设内容。
- 示例会话仅保存在内存中，刷新清空。输入不会送往模型；终端只匹配预设命令，绝不执行输入。
- 消息导轨绑定本页真实渲染的示例消息，不伪造原生会话或检测数据。Cursor 不展示未验证过的真实导轨。
- 「原版参考」只是关闭美术和配色后的网页对照，不是撤下用户本机主题；豆包/Codex 的真实恢复入口仍是「原版启动」。
- VS Code/Cursor 的完整美术演示不改变公开 VSIX 以颜色主题为主的边界；Grok 完整挂载仍需本机已登记适配器。
- 不含用户登录、会话、Key、原生应用程序、适配器日志或真实项目文件。
- 本次仅做类型、素材、链接、构建与静态路由检查，按用户选择不进行浏览器逐项点击验收；视觉由用户体验确认。

构建沿用 `npm run build:demo`，之后运行 `npm run qa:demo:routing` 检查全部启动/恢复映射、跟随系统、返回选择、失败拦截、资源去重及 Worker 路由。此检查不打开浏览器或目标应用。歌曲仍按原有构建时变量注入，不提交到 Git。原角色、美术与音乐授权边界见根目录 `ASSET_LICENSES.md`；不因网页预览而转为 MIT。没有重建或替换 Windows EXE。
