Diana ZCode Theme - 启动器生成的本机一次性实验适配器
版本：experimental-3.6.5-v3
已验证目标：ZCode 3.6.5.4145（实际路径由 Diana 启动器传入并再次核验）

安全边界：
- 不修改 ZCode.exe、app.asar、安装目录、快捷方式或用户配置。
- 不创建服务、计划任务、开机启动或后台 watcher。
- 只绑定 127.0.0.1，并使用每次随机选择的高位端口。
- 不下载远程 CSS、图片、脚本或更新。
- 日志不记录会话、项目名、DOM、截图、Cookie、令牌或 WebSocket 地址。
- 启动器会把已经解析出的 Windows PowerShell 绝对路径传给适配器；手动脚本则沿用当前 PowerShell 进程，不依赖桌面 PATH 中存在 pwsh.exe。

风险：
调试端口没有身份认证。同一 Windows 账户下的其他本地进程可能发现端口并读取界面、截图或执行渲染器脚本。
停止注入器或禁用主题不会关闭端口。必须完全退出所有实验启动的 ZCode，风险才结束。

首次启动：
1. 先手动完全退出普通 ZCode。
2. 在 Diana 启动器中选择 ZCode 与日间/暗夜，阅读风险说明后确认。
3. 适配器验证官方签名、精确版本、监听地址、监听进程和渲染器后才注入。
4. Start-DianaZCode.ps1 仅作为默认安装路径下的本机手动入口保留。

禁用主题：
运行 Disable-DianaZCode.ps1。

完整恢复：
运行 Restore-DianaZCode.ps1，然后完全退出 ZCode，再从原快捷方式正常启动。

查看状态：
运行 Get-DianaZCodeStatus.ps1。

注意：
这是本机实验适配器，不代表跨版本兼容。ZCode 更新后适配器会拒绝启动，直到重新验证；不要把该运行目录当作公开发行组件转发。
