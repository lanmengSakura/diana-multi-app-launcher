# Beta.4 RC.4 交付检查记录

日期：2026-09-09。版本：`0.1.0-beta.4-rc.4`。本记录对应 [RC.4 发布页](https://github.com/lanmengSakura/diana-multi-app-launcher/releases/tag/v0.1.0-beta.4-rc.4) 与 [Issue #1 处理回执](ISSUE_1_RECEIPT.md)。

## 构建产物

本轮在 Windows 本地完成 TypeScript/Vite、Rust release 和 NSIS 构建，不依赖 GitHub Actions 保存安装包。便携 EXE 的文件版本、产品版本均为 `0.1.0-beta.4-rc.4`。两份 EXE 均未签名。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `diana-multi-app-launcher_0.1.0-beta.4-rc.4_x64-portable.exe` | 27,930,112 | `fea7a7cbac74097160b2db06faa2e5aee597aec2d7f85b8dad3baae05d1ce3dc` |
| `Diana-Multi-App-Launcher_0.1.0-beta.4-rc.4_x64-setup.exe` | 19,756,388 | `db6f8c93b836834ab7087adce90143dca5f1583cec13f28c3e3494126bdad2d4` |
| `SHA256SUMS.txt` | 249 | `3d49563f7c17e1bc9fe3eacd10513694384576685832a45d006b76e2c3f01c34` |

候选 EXE 内容检查确认 39 份去重后的受保护文件已编入；配乐保留，长度为 1,876,570 字节，SHA-256 为 `0c4e597d075c2dad1262cbe10d2d0df14830c530284ed09e970e5ff69bd270d8`。这项检查确认内容存在与校验一致，不等于运行时验收。

## 自动化检查

- Rust：53 项通过，1 项真实应用 smoke 保持忽略。
- 状态轮询及交付导出：9 项通过。
- 演示路由：12 项通过；仅运行测试，没有重新部署演示站。
- TypeScript、Vite 生产构建、Rust 格式和差异空白检查通过。
- 资源完整性检查通过：Codex 12 项、Cursor/Grok 38 项、ZCode 9 项；各清单中有共享内容，不能相加视为去重文件数。
- 完整挂载原有的授权、版本、签名、哈希与进程归属检查没有放宽。

## 本机覆盖

在启动器未运行时，仅原位替换启动器 EXE；先保存旧 EXE，再核对新旧哈希。安装后的新 EXE 与上表便携版一致，备份旧 EXE 的 SHA-256 为 `651e6f60ded4191c442032ea12330a7bc5ba612a930d30f8997ed91c406a7bb5`。应用关联文件覆盖前后哈希一致。

没有执行安装器，没有迁移恢复记录，也没有启动、关闭或挂载任何目标应用。本机备份路径不写入公开文档。

## 未覆盖的验收

尚未在反馈者的 Windows 10 / 8GB 环境复验，未进行干净机器安装/卸载、八款应用真实挂载/恢复、新单实例唤回窗口和原生文件选择框的交互测试。豆包 `all_frames` 保留待确认，不计入已修复项。源代码和构建检查通过，不代表以上运行时项目已通过。
