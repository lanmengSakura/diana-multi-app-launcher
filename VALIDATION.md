# v0.1.0-beta.2 验证记录

验证日期：2026-09-02（Windows）

## Beta.1 故障复现与修复

- 在原 Beta.1 Windows 工作区复现：暗夜 CSS 实际 SHA-256 为 `0E291703DAA3C37BFC5E1D928F7F6BF92058E37555315D5AA5B415DEE95A2F21`，日间 CSS 为 `9992F82877FCF77366F93272BBE15BD1EA9357FE22FC3CB2D9D526411B4D106E`，与清单中的 LF 字节哈希不一致；
- 新增的 Node 构建门禁和 Rust 内置字节测试均能在旧工作区准确拦截 `SHA-256 mismatch`；
- `.gitattributes` 将受保护的 Codex 运行时 CSS 固定为 LF；从 `core.autocrlf=true` 的全新检出验证，暗夜与日间 CSS 分别恢复为清单中的 `A0138B...` 与 `DE1ACC...`；
- 启动器会在写入 `%LOCALAPPDATA%` 前再次校验 EXE 内置主题包，避免不一致文件覆盖已有本机运行时。

## 已通过

- `npm run build`：12 个受保护资源、LF 与 SHA-256 门禁、TypeScript 和 Vite 生产构建通过；
- `npm run qa:interactions`：8 个目标、列表折叠/展开、目标切换和完整挂载优先分支通过，浏览器消息为空；
- `npm run qa:music`：按钮 `ready -> playing -> paused` 状态机通过，浏览器消息为空；
- `npm audit --omit=dev`：0 个漏洞；
- `cargo fmt --check` 通过；
- `cargo test`：23/23 Rust 单元测试通过，其中包含编译进 EXE 的主题清单回归测试；
- Tauri release 与 NSIS 构建通过；安装器和便携 EXE 的文件版本、产品版本均为 `0.1.0-beta.2`；
- 便携 EXE 中找到了完整的暗夜 CSS、日间 CSS、运行时清单与 1,876,570 字节音乐载荷；
- 两个 EXE 均未发现本机用户名、源码盘符、构建目录或 `C:\Users\` 绝对路径；
- 仓库快照不包含 Cookie、令牌、会话截图、WebSocket 地址、本机状态目录或构建时歌曲源文件。

## 公开 Beta 构建约束

- 版本：`0.1.0-beta.2`；Windows EXE 未签名；
- 构建时通过 `DIANA_HOPEFUL_DREAMER_AUDIO` 编入已验证的 2 分 32.5 秒 M4A 循环；源文件 1,876,570 字节，SHA-256 为 `0C4E597D075C2DAD1262CBE10D2D0DF14830C530284ED09E970E5FF69BD270D8`；
- 歌曲源文件不进入 Git；发布产物只保留应用内播放所需字节，不提供远程下载或独立导出入口；
- 本轮没有启动、退出或连接正在运行的 Codex；完整挂载仍以用户机器上的运行时状态为准。

## 尚待用户侧扩大验证

- 不同 Windows 11 补丁版本、缩放比例和多显示器布局；
- 目标应用升级后的拒绝/重新适配行为；
- 从完全退出状态进行日间、暗夜、跟随系统、恢复原版与普通入口重启；
- 长会话、设置、差异视图、工具卡、窄屏和辅助功能。

## 发布附件

| 文件 | 字节 | SHA-256 | 签名 |
|---|---:|---|---|
| `Diana-Multi-App-Launcher_0.1.0-beta.2_x64-setup.exe` | 20,500,543 | `C7735568F436D28B8FD58D74690EA5C089B2F17007D60895D8AF05E05828F8FF` | `NotSigned` |
| `diana-multi-app-launcher_0.1.0-beta.2_x64-portable.exe` | 28,345,856 | `37C993C06FD924079040C86CE64C9DD6577CCDC07D30962EFFA5082AF3584E94` | `NotSigned` |

两份产物的 SHA-256 已与独立 `SHA256SUMS-launcher.txt` 逐项复核一致。
