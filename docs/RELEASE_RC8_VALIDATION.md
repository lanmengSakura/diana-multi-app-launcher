# RC.8 发布核验（2026-10-26）

版本：`0.1.0-beta.4-rc.8`，Windows x64，安装版与便携版。保留预发布状态，未新增目标应用全场景验收。

## 自动与隔离检查

- TypeScript 与生产界面构建通过；旧 Codex、Cursor、Grok、ZCode 受保护运行资源摘要通过。
- Rust：59 项通过，2 项实机辅助保持忽略。包含网页目录与桌面 EXE 互斥校验、旧混合关联只读识别、两个目标独立保存与重置、失效路径不回退。
- 关联界面：24 项检查通过，使用模拟 IPC 和临时浏览器；桌面与网页主/副按钮分别发送对应目标，取消官方插件安装不发送动作。原生文件选择框未实际点选。
- 全体入口交互检查通过：9 个启动器入口，两个 DeepSeek 的名称、外观说明和恢复标签分开；按钮及连接臂的尺寸、美术不变。已查看两种入口的隔离截图，无布局越界或文字重叠。
- 官方插件逻辑 4 项、合成日夜布局 5 组、交付脚本 9 项通过。合成布局包括本机实验 ZCode 夹具，不把实验代码加入仓库或分发包。
- 演示构建与路由检查 13 项通过。新增桌面入口在源码演示中明确说明尚无独立桌面布局，不冒充或跳转成旧网页端；没有部署线上站点。

## 可下载产物

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `diana-multi-app-launcher_0.1.0-beta.4-rc.8_x64-portable.exe` | 34311680 | `0d8fb90f19712a9c0b13ad705d7fd6fccc75d430523ae85d602d2aeee6906b6a` |
| `Diana-Multi-App-Launcher_0.1.0-beta.4-rc.8_x64-setup.exe` | 22629447 | `1fc04aa7333c89fa1027e1db621d3c1a3520b64141a4ca583de4bc512f9e5663` |

安装包由 Tauri/NSIS 生成，便携版是同一次 release 构建的程序原字节导出；不是把安装器改名。文件版本和产品版本均为 `0.1.0-beta.4-rc.8`。旧发布文件不覆盖。

候选二进制检查：39 个受保护资源逐项存在，素材原始字节未异常重复；官方桌面插件及管理脚本 8 个内嵌文件全部一致。插件客户端 SHA-256：`a51e11a0e0dd483dbf4f29e270188f12a16bd8b6db2782d5b0ce7171039db57b`。

内置配乐 1,876,570 字节，与已批准构建来源相同；SHA-256：`0c4e597d075c2dad1262cbe10d2d0df14830c530284ed09e970e5ff69bd270d8`。新版 ZCode 本机实验脚本未被打入二进制，仍由使用者另行批准和制作。

## 构建顺序与未验收项目

```powershell
npm ci --ignore-scripts
npm run build
npm run qa:app-links
npm run qa:interactions
npm run qa:desktop-adaptation
npm run qa:delivery
npm run build:demo
npm run qa:demo:routing
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
# 发布构建前，将 DIANA_HOPEFUL_DREAMER_AUDIO 指向已获授权的本机 M4A。
npm run tauri:build -- --bundles nsis
```

`scripts/verify-candidate-binary.mjs` 与 `package:windows` 另核验并导出最终文件；上传后须比对 GitHub 返回的资产摘要，而不是把本地构建成功当成公开发布成功。

本轮未启动/关闭目标应用、未更改现用启动器安装、未改本机账号与关联设置。未做干净机器安装/卸载、报告者环境复现、桌面 DeepSeek 实机日间全流程或所有应用恢复周期。之前的单机暗夜插件安装记录与本轮夹具检查分开陈述，不作跨机器或未来版本兼容承诺。
