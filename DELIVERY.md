# 首次交付与候选验收

本次公开测试包为 `0.1.0-beta.4-rc.3`，新增本机应用关联并保留 rc.2 交付补齐和 Cursor 跟随系统修复。请下载本次 Release 的新 EXE 并核对 SHA-256；旧版不会自动更新。仍为预发布版本，不作全场景或跨版本兼容承诺。

## 各入口实际需要什么

| 应用 | 首次准备 | 候选启动器的能力 |
|---|---|---|
| Codex | 官方 Codex、Node.js 22+ | 已内置运行时，不必先用模型重造适配器；退出后挂载 |
| Cursor | Cursor 3.17.21、Node.js 22+ | 新增版本限定完整运行组件；保留旧登记会话，不覆盖恢复记录 |
| Grok Bot | Grok Bot 0.28.0、Node.js 22+ | 新增版本限定完整运行组件，不再依赖作者机器 |
| ZCode | ZCode 3.6.5.4145、Node.js 22+ | 已内置版本限定运行组件 |
| 豆包浏览器 | 官方 Doubao.exe | 内置 MV3 扩展；工作区主题，不是“豆包工作” |
| VS Code | 官方 VS Code | 默认官方颜色主题；完整美术是另行选择的安装资源修改路线 |
| Windows Terminal | Terminal 1.24+ | 原生 Fragment；CMD 运行于 Terminal，不要求 PowerShell 7 |
| DeepSeek Harness | 对应仓库固定版本源码已完成部署/构建 | 检测并启动，不会代装整套上游或模型 Key |

自定义位置可使用 `DIANA_CURSOR_EXE`、`DIANA_GROK_EXE`、`DIANA_DEEPSEEK_HARNESS_ROOT`；安装路径错误时按提示更正，不能照抄作者路径。

rc.3 补充图形化“关联”入口：在状态栏旁选择应用位置并保存，无需修改环境变量。手动关联优先于旧环境变量和常见目录检测；路径失效时须修复关联或主动恢复自动识别，不会默默改用另一份安装。Codex 继续由官方安装包自动定位，DeepSeek Harness 选择已部署的项目根目录。详见 [本机应用关联](APP_ASSOCIATION.md)。

首次点击开启实验端口前须单独确认；普通窗口未退出时不强杀、不抢占。Node.js 缺失或过旧、签名/版本/哈希不符时停止，并显示缺失条件。网页演示不检测这些真实条件。

## 恢复并不完全相同

Codex、豆包是“原版启动”，先完整退出再普通重开。Cursor 运行中先撤下美术，退出后再次恢复用户设置。Grok/ZCode 可以在受管会话中撤下美术；必须完整退出该实例才能关闭调试端口。Terminal 的 Fragment 会保留，卸载脚本可恢复默认项；DSH 的源码恢复必须重建。

## 开发者交付检查

```powershell
npm ci --ignore-scripts
npm run build
npm run build:demo
npm run qa:demo:routing
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
```

Cursor/Grok 运行资源由各自仓库的 `npm run build:runtime` 生成，再用本仓库 `node scripts/sync-reviewed-runtimes.mjs` 同步。十张公共美术在 EXE 中只保留同一份源，不能把本机 state/logs/backups 打入包。无新 Actions 流水线或额外远端存储消耗。

本轮源码/隔离测试与 `0.1.0-beta.4-rc.2` 便携候选已构建，既有配乐已逐字节核对，定稿视觉未改；ZCode 受保护文件的 LF 与原 SHA-256 新增构建门禁。成品可用 `node scripts/verify-candidate-binary.mjs "<候选 EXE 绝对路径>"` 检查（需要指向构建音频的 `DIANA_HOPEFUL_DREAMER_AUDIO`，不会执行 EXE）。

rc.2 内置 Cursor `reviewed-cursor-3.17.21-v3`：分开记录请求模式与原生实际明暗，修复“跟随系统”时的浅色文字体系与暗色美术背景混用；只有颜色和视觉层一致时才确认挂载成功。在 Cursor 3.17.21 上已复验当前系统浅色、手动日夜、窄窗输入和撤下恢复。未改全局 Windows 配色，不代表所有场景、其他应用或未来版本均已验收。

本版提供 NSIS 安装器与便携 EXE。真实八目标完整场景、新用户/干净机器等扩大验收仍待完成；不得以此测试版支撑“所有版本一键部署”的宣传。
## 给用户或部署模型的共同要求

只从对应仓库 Release 获取发行包，保留目录结构并先核对 SHA-256。使用绝对安装路径，路径含空格时加引号。不要复制作者机器的路径、登录态、恢复记录或日志。

遇到版本、签名、SHA-256、程序路径或页面结构错误时停止，并提供目标版本和脱敏错误码；不要改哈希“让校验通过”、强杀整个进程树、替换应用可执行文件或擅自创建常驻任务。

文件存在、脚本退出码为零、演示页正常都不是实际挂载成功。扩大验收应包含真实日夜画面、点击输入滚动、恢复及普通重开。本版已测范围见 RELEASE_NOTES.md，后续源码修改不会自动更新已有 Release 资产。
