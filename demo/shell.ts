import "./shell.css";
const frame = document.querySelector<HTMLIFrameElement>("#launcher-frame")!;
const fit = document.querySelector<HTMLElement>("#launcher-fit")!;
const activity = document.querySelector<HTMLElement>("#activity")!;
const closed = document.querySelector<HTMLElement>("#closed-panel")!;
const exitButton = document.querySelector<HTMLButtonElement>("#simulate-exit")!;
const errorButton = document.querySelector<HTMLButtonElement>("#simulate-error")!;
const targetNote = document.querySelector<HTMLElement>("#target-note")!;
const boundary: Record<string, string> = {
  codex: "状态与进程编号均为模拟。Codex 切换外观或原版启动需完整退出，可用下方按钮模拟这一步。",
  cursor: "公开包不含 Cursor 专用适配器。本演示展示未登记适配器时的官方配色路径，不冒充完整挂载。",
  grokbot: "公开包不含 Grok Bot 专用适配器；未登记时拒绝挂载。该入口不可用是安全边界，并非网页故障。",
  vscode: "演示标准 Diana 颜色主题的应用与恢复；公开包不会自动改写 VS Code 安装资源。",
  deepseek: "没有本地源码部署时，只准备视觉蓝图；演示不会创建服务或打开访客的文件夹。",
  doubao: "豆包使用用户态扩展，明暗跟随豆包设置。恢复入口是原版启动，并非浏览器内即时换肤。",
  terminal: "演示用户级 Fragment 的安装与默认终端入口；不会修改已有命令窗口。",
  zcode: "完整挂载仍受版本、签名与运行时检查限制。演示通过不代表访客本机版本已经兼容。"
};
function scale() {
  const visual = fit.parentElement!;
  const byWidth = Math.min(636, visual.clientWidth) / 636;
  const byHeight = window.innerWidth > 900 ? Math.max(620, window.innerHeight - 132) / 930 : 1;
  const ratio = Math.min(1, byWidth, byHeight);
  fit.style.width = `${636 * ratio}px`;
  fit.style.height = `${930 * ratio}px`;
  frame.style.transform = `scale(${ratio})`;
}
new ResizeObserver(scale).observe(fit.parentElement!);
window.addEventListener("resize", scale);
scale();
const post = (type: string) => frame.contentWindow?.postMessage({ source: "diana-demo-shell", type }, window.location.origin);
exitButton.addEventListener("click", () => post("simulate-exit"));
errorButton.addEventListener("click", () => post("fail-next"));
function reopen(reset = false) {
  if (reset) for (const key of ["diana-launcher-target", "diana-launcher-theme", "diana-launcher-selector-collapsed"]) localStorage.removeItem(key);
  frame.src = "/launcher.html";
  frame.hidden = false;
  closed.hidden = true;
  activity.textContent = "演示已重新开始；音乐关闭。所有操作仅影响网页。";
}
document.querySelector("#restart")!.addEventListener("click", () => reopen(true));
document.querySelector("#reopen")!.addEventListener("click", () => reopen());
document.querySelectorAll<HTMLButtonElement>("[data-backdrop]").forEach(button => button.addEventListener("click", () => {
  document.body.dataset.backdrop = button.dataset.backdrop;
  document.querySelectorAll<HTMLButtonElement>("[data-backdrop]").forEach(other => other.setAttribute("aria-pressed", String(other === button)));
}));
window.addEventListener("message", event => {
  if (event.origin !== window.location.origin || event.source !== frame.contentWindow || event.data?.source !== "diana-demo") return;
  const { type, detail } = event.data;
  if (type === "activity" && typeof detail === "string") activity.textContent = detail;
  if (type === "selection" && detail && typeof detail.target === "string") {
    targetNote.textContent = boundary[detail.target] ?? boundary.codex;
    exitButton.hidden = detail.target !== "codex";
    errorButton.disabled = detail.target === "grokbot";
  }
  if (type === "close" || type === "minimize") {
    frame.hidden = true;
    frame.src = "about:blank"; // Unloads audio and simulation state as a real close would.
    closed.hidden = false;
    document.querySelector("#closed-label")!.textContent = type === "close" ? "演示已关闭" : "演示已最小化";
    activity.textContent = "这里只收起网页立牌。点击“重新展开”继续体验。";
  }
});
