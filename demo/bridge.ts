/** Browser-only, in-memory simulator. No native adapter, process or localhost access. */
import { configQuery, fromLauncher, launcherTargets, parseConfig, type DemoConfig } from './theme-catalog';
import { previewLinkStatus } from '../src/app-link-api';
declare const __DEMO_MUSIC_BYTES__: number;
type Mode = "dark" | "light" | "system";
type Target = "codex" | "doubao" | "terminal" | "vscode" | "cursor" | "grokbot" | "deepseek" | "zcode";
const send = (type: string, detail: unknown = null) => window.parent.postMessage({ source: "diana-demo", type, detail }, window.location.origin);
const delay = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));
const query = new URLSearchParams(location.search || window.parent.location.search);
if (query.has('app')) {
  const config = parseConfig(query.toString());
  const target = Object.entries(launcherTargets).find(([, app]) => app === config.app)![0];
  try {
    localStorage.setItem('diana-launcher-target', target);
    if (config.mode !== 'original') localStorage.setItem('diana-launcher-theme', config.mode);
  } catch { /* Optional preferences; disabled storage must not block the demo. */ }
}
function navigate(target: Target, mode: string, original: boolean) {
  const config: DemoConfig | null = fromLauncher(target, mode, original, matchMedia('(prefers-color-scheme: dark)').matches);
  if (!config) return;
  if (window.parent === window) location.assign(`/themes?${configQuery(config)}`);
  else send('navigate', config);
}
const titles: Record<Target, string> = { codex: "Codex", doubao: "豆包", terminal: "Windows Terminal", vscode: "VS Code", cursor: "Cursor", grokbot: "Grok Bot", deepseek: "DeepSeek Harness", zcode: "ZCode" };
let selected: Target = "codex";
let failNext = false;
let codex = {
  stage: "ready", codexRunning: false, themeChannelConnected: false,
  processCount: 0, mainProcessId: null as number | null, codexVersion: "演示",
  codexPath: null, activeThemeMode: null as Mode | null, debugPort: null,
  runtimeRoot: "演示环境（没有本机文件）", compatibilityMode: "demo",
  runtimeAvailable: true, nativeAppearanceManaged: false, actionRequired: null,
  message: "交互演示：选择外观，再点击主按钮。所有应用状态均为模拟。"
};
const states = new Map<string, Record<string, unknown>>();
function external(target: Target) {
  if (!states.has(target)) states.set(target, {
    target, stage: `${target}_pack_ready`,
    running: false, themed: false,
    themeState: "available",
    themeScope: "demo", processCount: 0, mainProcessId: null,
    executable: null, themeRoot: "模拟资源（没有本机文件）",
    message: `网页演示：${titles[target]} 已选择；点击主按钮进入对应主题页面。不操作本机。`
  });
  return structuredClone(states.get(target)!);
}

// Desktop confirmations concern processes/CDP. This isolated web bridge only
// navigates to the demo; do not ask visitors to approve fictitious native work.
window.confirm = () => true;

let callbackId = 1;
const bridge = {
  metadata: { currentWindow: { label: "demo" }, currentWebview: { label: "demo" } },
  transformCallback: () => callbackId++,
  unregisterCallback: () => {},
  invoke: async (command: string, args: Record<string, string> = {}) => {
    switch (command) {
      case "get_app_link_status": return previewLinkStatus(args.target);
      case "set_app_link":
      case "pick_app_path": throw new Error("网页演示不读取或保存本机路径，请在桌面启动器中关联。");
      case "plugin:event|listen": return callbackId++;
      case "plugin:event|unlisten":
      case "plugin:window|start_dragging": return null;
      case "plugin:window|minimize": send("minimize"); return null;
      case "quit_launcher": send("close"); return null;
      case "get_launcher_status": return structuredClone(codex);
      case "get_external_target_status": return external(args.target as Target);
      case "get_music_track_status": return {
        available: __DEMO_MUSIC_BYTES__ > 0, fileName: "Hopeful Dreamer.m4a", mimeType: "audio/mp4",
        sizeBytes: __DEMO_MUSIC_BYTES__, issue: __DEMO_MUSIC_BYTES__ ? null : "此源码构建未提供演示音频。"
      };
      case "load_music_track": {
        // A same-origin packaged asset, not an IPC or third-party request.
        const response = await fetch("/media/hopeful-dreamer.m4a");
        if (!response.ok) throw new Error("演示音频暂时无法加载，请稍后重试。");
        return response.arrayBuffer();
      }
      case "run_launcher_action": {
        send("activity", "正在打开 Codex 主题演示……");
        await delay(180);
        if (failNext) { failNext = false; throw new Error("演示异常：主题资源校验未通过。已中止模拟流程，未修改任何本机内容。"); }
        const mounted = args.action === "mount";
        codex = { ...codex, message: `网页演示已准备：Codex ${mounted ? 'Diana 主题' : '原版参考'}。未挂载本机。` };
        send("activity", codex.message);
        if (args.action === 'mount' || args.action === 'restore') navigate('codex', args.themeMode, !mounted);
        return structuredClone(codex);
      }
      case "run_external_target_action": {
        const target = args.target as Target;
        const status = external(target);
        send("activity", `正在打开 ${titles[target]} 的网页演示……`);
        await delay(180);
        if (failNext) { failNext = false; throw new Error("演示异常：运行时核验未通过。操作已中止，请查看状态信息。"); }
        const themed = args.action === "launch_theme";
        const message = `网页演示已准备：${titles[target]} ${themed ? 'Diana 主题' : '原版参考'}。未挂载本机。`;
        const next = { ...status, message };
        states.set(target, next);
        send("activity", message);
        if (args.action === 'launch_theme' || args.action === 'launch_native') navigate(target, args.themeMode, !themed);
        return structuredClone(next);
      }
      default: throw new Error(`演示未实现此命令：${command}`);
    }
  }
};
Object.defineProperty(window, "__TAURI_INTERNALS__", { value: bridge, configurable: false });
Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", { value: { unregisterListener: () => {} } });

window.addEventListener("message", event => {
  if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.source !== "diana-demo-shell") return;
  if (event.data.type === "simulate-exit") {
    codex = { ...codex, codexRunning: false, themeChannelConnected: false, processCount: 0, mainProcessId: null, stage: "ready", message: "演示：已模拟完整退出 Codex；如果有等待操作，会自动继续。" };
    send("activity", codex.message);
  }
  if (event.data.type === "fail-next") { failNext = true; send("activity", "下一次模拟操作将展示异常状态；再次操作即可重试。"); }
});

let previous = "";
new MutationObserver(() => {
  const stage = document.querySelector<HTMLElement>(".launcher-stage");
  if (!stage) return;
  selected = stage.dataset.selectedTarget as Target;
  const detail = { target: selected, mode: stage.dataset.selectedTheme, selector: stage.dataset.selectorState };
  const encoded = JSON.stringify(detail);
  if (encoded !== previous) { previous = encoded; send("selection", detail); }
}).observe(document.getElementById("root")!, { subtree: true, attributes: true, childList: true });
