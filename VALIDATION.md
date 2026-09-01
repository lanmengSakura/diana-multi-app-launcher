# v0.1.0-beta.1 验证记录

验证日期：2026-09-01（Windows）

## 已通过

- `npm run build`：TypeScript 与 Vite 生产构建通过。
- `npm run qa:interactions`：8 个目标、列表折叠/展开、目标切换和完整挂载优先分支通过，浏览器消息为空。
- `npm run qa:music`：按钮 `ready -> playing -> paused` 状态机通过；该测试使用内存测试音频，不代表公开包包含歌曲。
- `cargo fmt --check` 通过。
- `cargo test`：22/22 Rust 单元测试通过。
- 启动器仅接受回环调试地址；目标版本、签名、端口所有者或渲染器能力不匹配时拒绝接管。
- 仓库快照不包含 Cookie、令牌、会话截图、WebSocket 地址、本机状态目录或构建时歌曲源文件。

## 公开 Beta 构建约束

- 版本：`0.1.0-beta.1`。
- Windows EXE 未签名；发布页提供 SHA-256。
- 构建时通过 `DIANA_HOPEFUL_DREAMER_AUDIO` 编入已验证的 2 分 32.5 秒 M4A 循环；源文件 1,876,570 字节，SHA-256 为 `0C4E597D075C2DAD1262CBE10D2D0DF14830C530284ED09E970E5FF69BD270D8`。
- 歌曲源文件不进入 Git；发布产物只保留应用内播放所需字节，不提供远程下载或独立导出入口。
- 不把“源码测试通过”写成所有用户机器均已完成完整挂载；真实结果以启动器运行时状态为准。

## 尚待用户侧扩大验证

- 不同 Windows 11 补丁版本、缩放比例和多显示器布局。
- 目标应用升级后的拒绝/重新适配行为。
- 从完全退出状态进行日间、暗夜、跟随系统、恢复原版与普通入口重启。
- 长会话、设置、差异视图、工具卡、窄屏和辅助功能。

## 发布附件

| 文件 | 字节 | SHA-256 | 签名 |
|---|---:|---|---|
| `Diana-Multi-App-Launcher_0.1.0-beta.1_x64-setup.exe` | 20,503,299 | `5B6C627C663E12C65094395648F5A235C465AC0C57EF0172F309951E3AAE4448` | `NotSigned` |
| `diana-multi-app-launcher_0.1.0-beta.1_x64-portable.exe` | 28,338,688 | `BF71E241C31884F771DDA6180D31CB81F0CF557CDB063DAD2EF16C9089943D2F` | `NotSigned` |

两份产物的文件版本和产品版本均为 `0.1.0-beta.1`。Release 构建目录中的 `hopeful-dreamer.bin` 为 1,876,570 字节，SHA-256 与验证源一致。
