// Isolated UI checks: fresh headless profile, fixture paths and mocked IPC only.
// No installed launcher, application, native file dialog or CDP adapter is run.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const executablePath = [process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].find(path => path && existsSync(path));
assert.ok(executablePath, "A local Chrome executable is required for isolated UI QA.");
const output = resolve("artifacts/app-links");
mkdirSync(output, { recursive: true });
const server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: false } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ executablePath, headless: true });
const checks = [];
const errors = [];
const blockedRequests = [];
function record(name) { checks.push(name); }

function mockDesktop() {
  const savedKey = "qa-app-links";
  const names = { cursor: "Cursor.exe", grokbot: "Grok Bot.exe", zcode: "ZCode.exe",
    vscode: "Code.exe", doubao: "Doubao.exe", terminal: "wt.exe", deepseek: "Harness 项目根目录", codex: "官方安装包" };
  const state = window.__linkQA = { calls: [], picks: [], missing: [], failRead: false, failPick: false, holdPick: false, releasePick: null, appsReady: false };
  const stored = () => JSON.parse(localStorage.getItem(savedKey) || "{}");
  function link(target) {
    const savedPath = stored()[target] ?? null;
    const invalid = savedPath && state.missing.includes(savedPath);
    const automatic = target === "codex" ? "C:\\Program Files\\WindowsApps\\Official.Codex\\app\\ChatGPT.exe" : null;
    return { target, state: invalid ? "invalid" : savedPath ? "linked" : automatic ? "automatic" : "missing",
      path: invalid ? null : savedPath ?? automatic, savedPath, canChoose: target !== "codex",
      kind: target === "codex" ? "system" : target === "deepseek" ? "directory" : "file",
      expected: names[target], message: invalid ? "原路径已失效，请重新选择。"
        : target === "codex" ? "通过 Windows 官方安装包定位，更新后自动跟踪新目录。重新检测不会启动 Codex。"
        : savedPath ? "已使用你选择的位置；重新打开启动器后仍会保留。关联不代表已挂载或通过版本兼容性检查。"
        : "尚未自动找到应用，请选择安装目录中的程序。" };
  }
  let callbackId = 0;
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    transformCallback: () => ++callbackId, unregisterCallback() {},
    invoke: async (command, args = {}) => {
      state.calls.push({ command, args });
      if (command === "plugin:event|listen") return ++callbackId;
      if (command === "plugin:event|unlisten") return null;
      if (command === "get_launcher_status") return {
        stage: "ready", codexRunning: false, themeChannelConnected: false, processCount: 0,
        mainProcessId: null, codexVersion: null, codexPath: null, activeThemeMode: null,
        debugPort: null, runtimeRoot: null, compatibilityMode: "fixture", runtimeAvailable: true,
        nativeAppearanceManaged: true, actionRequired: null, message: "界面检查：没有操作本机应用。"
      };
      if (command === "get_external_target_status") return {
        target: args.target, stage: `${args.target}_${state.appsReady ? "ready" : "not_installed"}`, running: false, themed: false,
        themeState: state.appsReady ? "available" : "unavailable", themeScope: "fixture", processCount: 0, mainProcessId: null,
        executable: stored()[args.target] ?? null, themeRoot: null, message: "界面检查：没有操作本机应用。"
      };
      if (command === "get_music_track_status") return { available: false, fileName: null, mimeType: null, sizeBytes: null, issue: "隔离检查不播放音乐。" };
      if (command === "get_app_link_status") {
        if (state.failRead) throw new Error("模拟：关联设置暂时无法读取");
        return link(args.target);
      }
      if (command === "pick_app_path") {
        if (state.failPick) throw new Error("文件选择窗口未能完成；也可以直接粘贴完整路径。");
        if (state.holdPick) await new Promise(resolve => { state.releasePick = resolve; });
        return state.picks.shift() ?? null;
      }
      if (command === "set_app_link") {
        if (args.target === "codex") throw new Error("Codex 使用系统自动关联。");
        const links = stored();
        if (args.path === null) delete links[args.target];
        else {
          if (args.target !== "deepseek" && !args.path.endsWith(names[args.target])) throw new Error(`文件不匹配，请选择 ${names[args.target]}。`);
          links[args.target] = args.path;
        }
        localStorage.setItem(savedKey, JSON.stringify(links));
        return link(args.target);
      }
      // Any accidental launch/restore/music/quit call fails this test.
      throw new Error(`Forbidden or unexpected IPC during association: ${command}`);
    }
  };
}

try {
  const context = await browser.newContext({ viewport: { width: 636, height: 930 }, colorScheme: "dark", reducedMotion: "reduce" });
  await context.route("**/*", route => {
    if (new URL(route.request().url()).origin !== origin) { blockedRequests.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await context.addInitScript(mockDesktop);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  const modal = page.locator(".app-link-panel");
  const input = page.locator("#app-link-path");
  const save = page.getByRole("button", { name: "保存关联", exact: true });
  const browse = page.getByRole("button", { name: "浏览…", exact: true });
  const close = page.getByRole("button", { name: "关闭关联设置" });
  const trigger = page.locator(".app-link-trigger");
  const select = page.getByRole("combobox", { name: /选择要启动/ });
  const ready = () => page.waitForFunction(() => !document.querySelector(".app-link-close")?.disabled);
  async function open(target) {
    await select.selectOption(target);
    await trigger.click();
    await ready();
    assert.equal(await modal.evaluate(node => node.matches(":modal")), true);
  }
  await page.goto(origin, { waitUntil: "networkidle" });
  await select.selectOption("cursor");
  await page.screenshot({ path: resolve(output, "status-side-entry.png") });
  const [buttonBox, statusBox] = await Promise.all([trigger.boundingBox(), page.locator(".status-overlay").boundingBox()]);
  assert.ok(buttonBox.x >= statusBox.x + statusBox.width + 6, "Entry must not cover original status information");
  assert.ok(buttonBox.y >= statusBox.y && buttonBox.y + buttonBox.height <= statusBox.y + statusBox.height);
  assert.ok(buttonBox.width <= 50 && buttonBox.height <= 34);
  record("small entry beside the status plate, no information overlap");
  await page.getByRole("button", { name: "隐藏目标应用列表" }).click();
  await page.locator('.launcher-stage[data-selector-state="collapsed"]').waitFor();
  assert.equal(await trigger.isVisible(), true);
  await trigger.click(); await ready(); await close.click();
  await page.getByRole("button", { name: "展开目标应用列表" }).click();
  await page.locator('.launcher-stage[data-selector-state="expanded"]').waitFor();
  record("association remains usable when the application list is collapsed");

  await open("cursor");
  assert.equal(await save.isDisabled(), true);
  await page.screenshot({ path: resolve(output, "association-missing.png") });
  await page.evaluate(() => window.__linkQA.picks.push("E:\\应用示例\\Cursor\\Cursor.exe"));
  await browse.click(); await ready();
  assert.equal(await input.inputValue(), "E:\\应用示例\\Cursor\\Cursor.exe");
  assert.equal(await page.evaluate(() => localStorage.getItem("qa-app-links")), null);
  await page.screenshot({ path: resolve(output, "association-chosen.png") });
  record("native picker result is an unsaved draft; no auto-save or launch");
  await browse.click(); await ready(); // empty queue means cancel
  assert.equal(await input.inputValue(), "E:\\应用示例\\Cursor\\Cursor.exe");
  record("picker cancel preserves the draft and associations");
  await save.click(); await ready();
  assert.match(await page.locator(".app-link-state").innerText(), /已关联/);
  await input.fill("E:\\应用示例\\setup.exe");
  await save.click(); await ready();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("qa-app-links")).cursor), "E:\\应用示例\\Cursor\\Cursor.exe");
  record("failed save displays an error and keeps the existing association");
  await close.click();
  await page.waitForFunction(() => document.activeElement?.classList.contains("app-link-trigger"));
  record("dialog close restores keyboard focus to the entry");
  assert.ok(!(await page.evaluate(() => window.__linkQA.calls)).some(call => /^(run_|quit_|load_music)/.test(call.command)));

  await page.reload({ waitUntil: "networkidle" });
  await open("cursor");
  assert.equal(await input.inputValue(), "E:\\应用示例\\Cursor\\Cursor.exe");
  record("reopening the launcher retains the selected location (mock storage)");
  await page.evaluate(() => window.__linkQA.missing.push("E:\\应用示例\\Cursor\\Cursor.exe"));
  await page.getByRole("button", { name: "重新检测" }).click(); await ready();
  assert.match(await page.locator(".app-link-state").innerText(), /路径已失效/);
  assert.equal(await input.inputValue(), "E:\\应用示例\\Cursor\\Cursor.exe");
  await page.screenshot({ path: resolve(output, "association-invalid.png") });
  record("stale association remains visible for repair, not silently replaced");
  await close.click();
  await open("zcode");
  await input.fill("E:\\应用示例\\ZCode\\ZCode.exe"); await save.click(); await ready();
  await close.click();
  await open("cursor");
  await page.getByRole("button", { name: "恢复自动识别" }).click(); await ready();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("qa-app-links"))), { zcode: "E:\\应用示例\\ZCode\\ZCode.exe" });
  record("reset removes only the current application's manual location");

  await page.evaluate(() => { window.__linkQA.holdPick = true; });
  await browse.click();
  await page.waitForFunction(() => typeof window.__linkQA.releasePick === "function");
  await page.keyboard.press("Escape");
  assert.equal(await modal.isVisible(), true);
  assert.equal(await close.isDisabled(), true);
  await page.evaluate(() => { window.__linkQA.holdPick = false; window.__linkQA.releasePick(); });
  await ready();
  record("pending picker blocks duplicate operations and accidental dialog close");
  await page.evaluate(() => { window.__linkQA.failPick = true; });
  await browse.click(); await ready();
  await page.getByRole("alert").waitFor();
  assert.equal(await input.isEditable(), true);
  await page.evaluate(() => { window.__linkQA.failPick = false; });
  record("unavailable native picker falls back to manual paste");
  await close.click();

  await open("codex");
  assert.equal(await input.isEditable(), false);
  assert.equal(await browse.count(), 0);
  await page.getByRole("button", { name: "重新检测" }).click(); await ready();
  assert.ok(await page.evaluate(() => window.__linkQA.calls.some(call => call.command === "get_app_link_status" && call.args.target === "codex" && call.args.rescan === true)));
  record("Codex is system-managed and supports explicit rescan, not pinned EXE versions");
  await close.click();
  await open("deepseek");
  await page.getByText("项目根目录", { exact: true }).waitFor();
  await page.getByText(/依赖安装、构建和模型配置仍按项目说明准备/).waitFor();
  await input.fill("E:\\项目示例\\deepseek-harness"); await save.click(); await ready();
  for (const width of [636, 390]) {
    await page.setViewportSize({ width, height: 930 });
    const bounds = await modal.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 930);
    assert.ok(await modal.evaluate(node => node.scrollWidth <= node.clientWidth));
  }
  await page.setViewportSize({ width: 636, height: 930 });
  record("Harness folder instructions and dialog layout stay readable at narrow widths");
  await page.keyboard.press("Escape");
  await modal.waitFor({ state: "detached" });
  await page.evaluate(() => { window.__linkQA.failRead = true; });
  await open("grokbot");
  await page.getByRole("alert").waitFor();
  await page.evaluate(() => { window.__linkQA.failRead = false; });
  await page.getByRole("button", { name: "重新检测" }).click(); await ready();
  assert.equal(await input.isEditable(), true);
  record("initial read failure can retry without closing or resetting settings");
  assert.ok(!(await page.evaluate(() => window.__linkQA.calls)).some(call => /^(run_|quit_|load_music)/.test(call.command)));
  record("association never invoked a launcher action, music loader, or quit command");
  await close.click();
  await page.evaluate(() => { window.__linkQA.appsReady = true; });
  for (const target of ["codex", "cursor", "grokbot", "zcode"]) {
    await select.selectOption(target);
    await page.waitForFunction(() => !document.querySelector(".primary-action")?.disabled);
    const confirmation = page.waitForEvent("dialog").then(async dialog => {
      const message = dialog.message();
      await dialog.dismiss();
      assert.match(message, /127\.0\.0\.1/);
      assert.match(message, /其他本地进程/);
      assert.match(message, /执行渲染页?脚本/);
      assert.match(message, /完整退出|被完整退出/);
    });
    await Promise.all([confirmation, page.locator(".primary-action").click()]);
    assert.ok(!(await page.evaluate(() => window.__linkQA.calls)).some(call => /^run_/.test(call.command)));
    record(`${target}: explicit debugger-risk notice, cancellation never invokes a mount (Codex fixture has an existing palette record)`);
  }

  const preview = await browser.newPage({ viewport: { width: 636, height: 930 } });
  preview.on("pageerror", error => errors.push(error.message));
  await preview.goto(origin, { waitUntil: "networkidle" });
  await preview.locator(".app-link-trigger").click();
  await preview.getByText("网页预览", { exact: true }).waitFor();
  assert.equal(await preview.getByRole("button", { name: "保存关联", exact: true }).count(), 0);
  assert.equal(await preview.getByRole("button", { name: "浏览…", exact: true }).count(), 0);
  record("browser preview cannot read, choose or save real application paths");
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedRequests, []);
  const result = { status: "ok", count: checks.length, checks, errors, blockedRequests,
    scope: "Mock IPC and isolated browser only; Rust fixture tests validate actual file persistence separately. No native picker or target application was opened." };
  writeFileSync(resolve(output, "qa-results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await server.close();
}
