/** Browser-only, in-memory simulator. No native adapter, process or localhost access. */
export {};
declare const __DEMO_MUSIC_BYTES__: number;
type Mode = "dark" | "light" | "system";
type Target = "codex" | "doubao" | "terminal" | "vscode" | "cursor" | "grokbot" | "deepseek" | "zcode";
const send = (type: string, detail: unknown = null) => window.parent.postMessage({ source: "diana-demo", type, detail }, window.location.origin);
const delay = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));
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
    target, stage: target === "grokbot" ? "grokbot_runtime_missing" : target === "deepseek" ? "deepseek_theme_needs_deploy" : `${target}_pack_ready`,
    running: false, themed: false,
    themeState: target === "grokbot" ? "blocked" : "available",
    themeScope: "demo", processCount: 0, mainProcessId: null,
    executable: null, themeRoot: "模拟资源（没有本机文件）",
    message: target === "grokbot" ? "交互演示：公开包不含 Grok Bot 专用适配器；未登记时拒绝挂载。"
      : target === "cursor" ? "交互演示：未登记专用适配器时，仅应用官方颜色主题。"
      : target === "deepseek" ? "交互演示：未检测本地源码部署时，仅提供视觉蓝图。"
      : `交互演示：${titles[target]} 已选择；点击按钮查看模拟操作流程。`
  });
  return structuredClone(states.get(target)!);
}

const originalConfirm = window.confirm.bind(window);
window.confirm = message => originalConfirm(`【网页交互演示】以下是桌面版的操作说明。本页不会访问本机，也不会真正挂载或重启应用。\n\n${message}`);

let callbackId = 1;
const bridge = {
  metadata: { currentWindow: { label: "demo" }, currentWebview: { label: "demo" } },
  transformCallback: () => callbackId++,
  unregisterCallback: () => {},
  invoke: async (command: string, args: Record<string, string> = {}) => {
    switch (command) {
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
        send("activity", "正在模拟安全核验与外观切换……");
        await delay(1050);
        if (failNext) { failNext = false; throw new Error("演示异常：主题资源校验未通过。已中止模拟流程，未修改任何本机内容。"); }
        const mounted = args.action === "mount";
        codex = { ...codex, stage: mounted ? "mounted" : "plain_running",
          codexRunning: true, themeChannelConnected: mounted, nativeAppearanceManaged: mounted,
          activeThemeMode: mounted ? args.themeMode as Mode : null, processCount: 1, mainProcessId: 10001,
          message: mounted ? "模拟完成：Diana 外观已挂载。更换日夜需先模拟退出，再重新启动。" : "模拟完成：已从原版入口重新启动；没有对本机执行操作。"
        };
        send("activity", codex.message);
        return structuredClone(codex);
      }
      case "run_external_target_action": {
        const target = args.target as Target;
        const status = external(target);
        send("activity", `正在模拟 ${titles[target]} 的操作……`);
        await delay(900);
        if (failNext) { failNext = false; throw new Error("演示异常：运行时核验未通过。操作已中止，请查看状态信息。"); }
        const themed = args.action === "launch_theme";
        const state = !themed ? "plain" : target === "cursor" || target === "vscode" ? "selected"
          : target === "terminal" ? "installed" : target === "deepseek" ? "available" : target === "grokbot" ? "blocked" : "mounted";
        const message = !themed ? `模拟完成：${titles[target]} ${target === "doubao" ? "原版启动" : "恢复入口"}。未操作本机应用。`
          : target === "deepseek" ? "模拟完成：蓝图已准备；实际使用仍需本地源码部署。"
          : target === "cursor" || target === "vscode" ? "模拟完成：已应用 Diana 颜色主题；这不代表完整美术已挂载。"
          : target === "grokbot" ? "交互演示：公开包不含 Grok Bot 专用适配器，无法模拟为已挂载。"
          : `模拟完成：${titles[target]} 的 Diana 外观已启用。本页没有访问或启动应用。`;
        const next = { ...status, stage: !themed ? `${target}_plain_running` : target === "deepseek" ? "deepseek_theme_needs_deploy" : target === "grokbot" ? "grokbot_runtime_missing" : `${target}_diana_ready`,
          themed: themed && state !== "blocked" && state !== "available", themeState: state,
          running: target !== "deepseek" && state !== "blocked", processCount: target === "deepseek" ? 0 : 1,
          mainProcessId: target === "deepseek" ? null : 10002, message };
        states.set(target, next);
        send("activity", message);
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
