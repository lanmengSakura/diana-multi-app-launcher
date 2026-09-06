export type AppId = 'doubao' | 'cursor' | 'grok' | 'zcode' | 'vscode' | 'terminal' | 'deepseek';
export type ThemeMode = 'dark' | 'light' | 'original';
export type Scene = 'conversation' | 'home';
export type DemoConfig = { app: AppId; mode: ThemeMode; scene: Scene };

export const apps: { id: AppId; name: string; short: string; subtitle: string; repo: string; note: string; day: boolean }[] = [
  { id: 'doubao', name: '豆包浏览器', short: '豆包', subtitle: '聊天工作区 · 浏览器扩展', repo: 'diana-doubao-theme', day: true,
    note: '主题作用于豆包聊天工作区，浏览器栏保留原貌。窄窗口会按正式样式隐藏立绘，避免遮挡正文。真实入口的恢复操作为「原版启动」。' },
  { id: 'cursor', name: 'Cursor', short: 'Cursor', subtitle: 'Agent 工作台', repo: 'diana-cursor-theme', day: true,
    note: '这里展示完整美术布局。公开颜色主题包不含专用挂载适配器；本机完整挂载需已有适配器与匹配版本。' },
  { id: 'grok', name: 'Grok Bot', short: 'Grok Bot', subtitle: '对话 · 右下角弧光', repo: 'diana-grok-bot-theme', day: true,
    note: '保留右下角离心圆弧：暗夜为黑色内侧与窄外发光，日间为浅色。完整挂载需本机适配器与匹配版本。' },
  { id: 'zcode', name: 'ZCode', short: 'ZCode', subtitle: '任务工作区 · 消息导轨', repo: 'diana-zcode-theme', day: true,
    note: '导轨对应本页的示例消息，可点击跳转。真实挂载受目标版本与运行时结构限制，网页效果不代表兼容性检测结果。' },
  { id: 'vscode', name: 'Visual Studio Code', short: 'VS Code', subtitle: '编辑器 · 文件树 · 终端', repo: 'diana-vscode-theme', day: true,
    note: '完整美术层视觉演示，日间使用独立立绘与着色线稿。标准 VSIX 默认提供颜色主题，美术层需另行适配。' },
  { id: 'terminal', name: 'Windows Terminal', short: 'Terminal', subtitle: 'PowerShell / CMD', repo: 'diana-windows-terminal-theme', day: false,
    note: '沿用正式 Diana Night Fragment 与背景图，没有额外制作日间主题。两个标签可切换；命令输入仅在网页内模拟，不执行系统命令。' },
  { id: 'deepseek', name: 'DeepSeek Harness', short: 'DeepSeek', subtitle: '工作区 · 会话 · 详情', repo: 'diana-dsh-theme', day: true,
    note: '这是 Harness 本地工作台的主题演示，不是 DeepSeek 官网聊天页。真实使用需要先部署 Harness；演示不包含模型服务。' },
];

export function parseConfig(search: string): DemoConfig {
  const params = new URLSearchParams(search);
  const app = apps.find(item => item.id === params.get('app')) ?? apps[0];
  const mode = params.get('theme');
  return { app: app.id, mode: mode === 'original' ? mode : mode === 'light' && app.day ? mode : 'dark', scene: params.get('scene') === 'home' ? 'home' : 'conversation' };
}

export function configQuery(config: DemoConfig): string {
  return new URLSearchParams({ app: config.app, theme: config.mode, scene: config.scene }).toString();
}

export function isConfig(value: unknown): value is DemoConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  return apps.some(app => app.id === config.app) && ['dark', 'light', 'original'].includes(String(config.mode))
    && ['home', 'conversation'].includes(String(config.scene));
}
