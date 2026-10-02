# RC.7 发布核验

日期：2026-10-03

本次发布只包含已验证的公开启动器修复：

- Codex 桌宠/紧凑窗口保持宿主原生透明，不再被主题 body 背景铺成整块色块。
- 检测到旧版 VS Code 安装目录美术层时显示待恢复状态并暂停挂载，提示运行 `visual-layer\\restore.ps1`；正式路线仍为用户颜色主题。
- 运行时资源清单、受保护主题字节和内置《Hopeful Dreamer》音频均通过候选包检查。

## 自动检查

- `npm run build`：通过，运行时资源完整性、TypeScript 和生产构建通过。
- `npm run build:demo`：通过。
- `npm run qa:demo:routing`：12 项通过。
- `npm run qa:delivery`：9 项通过。
- `cargo test --manifest-path src-tauri/Cargo.toml --lib --locked`：55 项通过、1 项既有真实应用 smoke 按约定忽略。
- `node scripts/verify-candidate-binary.mjs <便携 EXE>`：通过；未执行 EXE。

## 发布包

| 文件 | 大小 | SHA-256 |
| --- | ---: | --- |
| `diana-multi-app-launcher_0.1.0-beta.4-rc.7_x64-portable.exe` | 27,920,896 bytes | `a67b366446238272383db394ebb7761fa3f941d175b1abc1edac7442f75fe5bf` |
| `Diana-Multi-App-Launcher_0.1.0-beta.4-rc.7_x64-setup.exe` | 19,760,882 bytes | `b629d7f7f3a52e3628e04a34d74c202bad85cf84262813b46d86bf290a9c9d30` |

内置获准音频源为 1,876,570 bytes，SHA-256：`0c4e597d075c2dad1262cbe10d2d0df14830c530284ed09e970e5ff69bd270d8`。两种 EXE 均未签名；发布包仍为预发布版本，不宣称已在所有目标应用版本和干净机器上完成真机验收。
