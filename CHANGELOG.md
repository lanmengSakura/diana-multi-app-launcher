# Changelog

## 0.1.0-beta.2 - 2026-09-01

- 修复 Windows 检出源码时 CSS 从 LF 转为 CRLF，导致 Codex 适配器报 `SHA-256 mismatch` 并在启动前中止的问题。
- 用 `.gitattributes` 固定受保护的 Codex 运行时 CSS 为 LF。
- 新增构建前资源哈希检查、内置字节运行时检查及 Rust 回归测试；主题包不一致时不会再写入用户目录。
- Beta.1 已标记为已知故障版本，用户应升级到 Beta.2。

## 0.1.0-beta.1 - 2026-09-01

- 首个公开多应用测试版，提供可扩展目标列表、日间/暗夜/跟随系统和恢复入口。
- 集成 Codex、豆包、Windows Terminal、VS Code、Cursor、Grok Bot、DeepSeek Harness 与 ZCode 八个目标。
- 保留目标版本、签名、回环监听所有者、渲染器能力与真实挂载状态门禁。
- 不创建 watcher、服务、计划任务、登录启动项或自动更新。
- 公开构建内置 2 分 32.5 秒《Hopeful Dreamer》粉丝向歌词循环，默认关闭并可随时暂停。
- Windows 安装器与便携版暂未签名，发布页提供 SHA-256。
