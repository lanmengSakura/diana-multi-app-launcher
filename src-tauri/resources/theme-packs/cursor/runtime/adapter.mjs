import fs from "node:fs";
import net from "node:net";
import { options, checkPrerequisites, verifyBundle, trustedSocket, assertNoLinks, sha256 } from "./delivery-runtime.mjs";
import { rawValue as jsoncRawValue, editValue as replaceJsoncRaw, inspect, restoreValues } from "./settings-jsonc.mjs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ADAPTER_VERSION = "reviewed-cursor-3.17.21-v3";
const CONFIG = options(ROOT, "Cursor.exe");
const CURSOR_EXE = CONFIG.executable;
const EXPECTED_VERSION = "3.17.21";
const EXPECTED_SIGNER = "5767825FF4C40538FD78C5F2CE270E633C474DFC";
const SETTINGS_PATH = CONFIG.settings;
const EXTENSION_PATH = path.join(CONFIG.extensions, "lanmengsakura.diana-cursor-theme-0.1.0");
const EXTENSION_SOURCE = path.join(ROOT, "extension");
const RESTORE_PATH = path.join(ROOT, "state", "restore-record.json");
const SESSION_PATH = path.join(ROOT, "state", "session.json");
const EVENT_LOG = path.join(ROOT, "logs", "events.jsonl");
const THEME_CSS = path.join(ROOT, "theme.css");
const WINDOWS_POWERSHELL_MODULE_PATH = [
  path.join(process.env.ProgramFiles ?? "C:\\Program Files", "WindowsPowerShell", "Modules"),
  path.join(
    process.env.WINDIR ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "Modules"
  )
].join(path.delimiter);
const MANAGED_KEYS = [
  "workbench.colorTheme",
  "workbench.preferredDarkColorTheme",
  "workbench.preferredLightColorTheme",
  "window.autoDetectColorScheme"
];

const ASSETS = {
  __DIANA_NIGHT_PORTRAIT__: "diana-night-v3.png",
  __DIANA_DAY_PORTRAIT__: "diana-corner-cutout-v2.png",
  __DIANA_CORNER__: "diana-left-top-detailed-corner-mask-v7.png",
  __DIANA_UPPER__: "diana-line-art-approved-upper.png",
  __DIANA_DOODLE__: "diana-doodle-chalk-v2-approved.png",
  __DIANA_STAR__: "diana-hand-star-reference-v2.png",
  __DIANA_CANDY__: "diana-candy-wrapped-v1.png",
  __DIANA_LOLLIPOP__: "diana-candy-lollipop-v1.png",
  __ACAO_HEART__: "acao-heart-v3.png",
  __ACAO_CHEER__: "acao-cheer-v1.png"
};

function ensureDirectory(target) {
  fs.mkdirSync(target, { recursive: true });
}

function writeJsonAtomic(target, value) {
  ensureDirectory(path.dirname(target));
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    fs.renameSync(temporary, target);
  } catch (error) {
    if (!["EXDEV", "EEXIST", "EPERM"].includes(error.code)) throw error;
    // Windows cannot atomically replace some existing EFS-encrypted files.
    // The complete temporary file is copied over only after its write succeeds.
    fs.copyFileSync(temporary, target);
    fs.unlinkSync(temporary);
  }
}

function readJson(target) {
  return JSON.parse(fs.readFileSync(target, "utf8").replace(/^\uFEFF/, ""));
}

function appendEvent(stage, details = {}) {
  ensureDirectory(path.dirname(EVENT_LOG));
  const safe = {
    time: new Date().toISOString(),
    adapterVersion: ADAPTER_VERSION,
    stage,
    status: details.status ?? null,
    version: details.version ?? null,
    pid: Number.isInteger(details.pid) ? details.pid : null,
    port: Number.isInteger(details.port) ? details.port : null,
    errorCode: details.errorCode ?? null,
    note: details.note ?? null
  };
  fs.appendFileSync(EVENT_LOG, `${JSON.stringify(safe)}\n`, "utf8");
}

function fail(code, message, details = {}) {
  appendEvent("error", { ...details, status: "failed", errorCode: code });
  const error = new Error(message);
  error.code = code;
  throw error;
}

function powershell(script, extraEnv = {}) {
  const prefix =
    "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); " + script;
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", prefix],
    {
      encoding: "utf8",
      windowsHide: true,
      env: {
        ...process.env,
        PSModulePath: WINDOWS_POWERSHELL_MODULE_PATH,
        ...extraEnv
      },
      maxBuffer: 4 * 1024 * 1024
    }
  );
  if (result.status !== 0) {
    fail("POWERSHELL_FAILED", "本机身份核验命令执行失败。", {
      note: `exit=${result.status ?? "unknown"}`
    });
  }
  return result.stdout.trim().replace(/^\uFEFF/, "");
}

function trustReport() {
  const output = powershell(
    "$item=Get-Item -LiteralPath $env:DIANA_CURSOR_EXE -ErrorAction Stop; " +
      "$sig=Get-AuthenticodeSignature -LiteralPath $env:DIANA_CURSOR_EXE; " +
      "[pscustomobject]@{fileVersion=$item.VersionInfo.FileVersion;productVersion=$item.VersionInfo.ProductVersion;signature=[string]$sig.Status;signerThumbprint=if($sig.SignerCertificate){$sig.SignerCertificate.Thumbprint}else{''}} | ConvertTo-Json -Compress",
    { DIANA_CURSOR_EXE: CURSOR_EXE }
  );
  const report = JSON.parse(output);
  if (
    report.fileVersion !== EXPECTED_VERSION ||
    report.productVersion !== EXPECTED_VERSION
  ) {
    fail("VERSION_MISMATCH", `Cursor 版本不匹配；只允许 ${EXPECTED_VERSION}。`, {
      version: report.fileVersion
    });
  }
  if (
    report.signature !== "Valid" ||
    String(report.signerThumbprint).toUpperCase() !== EXPECTED_SIGNER
  ) {
    fail("SIGNATURE_MISMATCH", "Cursor 数字签名与已验证发布者不一致。", {
      version: report.fileVersion
    });
  }
  return report;
}

function cursorProcesses() {
  const output = powershell(
    "$items=@(Get-CimInstance Win32_Process -Filter \"Name='Cursor.exe'\" -ErrorAction SilentlyContinue | ForEach-Object { " +
      "$cmd=[string]$_.CommandLine; $p=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; " +
      "[pscustomobject]@{pid=[int]$_.ProcessId;path=[string]$_.ExecutablePath;primary=(-not $cmd.Contains('--type='));hasLoopback=($cmd.Contains('--remote-debugging-address=127.0.0.1'));debugPort=if($cmd -match '--remote-debugging-port(?:=|\\s+)(\\d+)'){[int]$Matches[1]}else{$null};visible=([bool]($p -and $p.MainWindowHandle -ne 0))} }); " +
      "$items | ConvertTo-Json -Compress"
  );
  if (!output) return [];
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function listenerOwner(port) {
  const output = powershell(
    "$items=@(Get-NetTCPConnection -State Listen -LocalPort ([int]$env:DIANA_CURSOR_PORT) -ErrorAction SilentlyContinue | ForEach-Object {[pscustomobject]@{pid=[int]$_.OwningProcess;address=[string]$_.LocalAddress;port=[int]$_.LocalPort}}); $items | ConvertTo-Json -Compress",
    { DIANA_CURSOR_PORT: String(port) }
  );
  if (!output) return [];
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function normalizeFile(target) {
  return path.resolve(target).toLocaleLowerCase("en-US");
}

function throwValidationError(code, message, details, quiet) {
  if (!quiet) fail(code, message, details);
  const error = new Error(message);
  error.code = code;
  throw error;
}

function validateManagedSession(port, quiet = false) {
  trustReport();
  const processes = cursorProcesses();
  const expectedPath = normalizeFile(CURSOR_EXE);
  const managedPrimary = processes.find(
    (item) =>
      item.primary &&
      item.hasLoopback &&
      item.debugPort === port &&
      item.path &&
      normalizeFile(item.path) === expectedPath
  );
  if (!managedPrimary) {
    throwValidationError(
      "MANAGED_CURSOR_NOT_FOUND",
      "没有找到属于本次 Diana 会话的可见 Cursor 主窗口。",
      { port },
      quiet
    );
  }
  const owners = listenerOwner(port);
  if (owners.some(item => item.address !== "127.0.0.1")) throwValidationError("NON_LOOPBACK_LISTENER", "拒绝非回环监听。", { port }, quiet);
  const owner = owners.find((candidate) => candidate.address === "127.0.0.1");
  if (!owner) {
    throwValidationError(
      "LISTENER_NOT_FOUND",
      "没有找到本次 127.0.0.1 调试监听。",
      { pid: managedPrimary.pid, port },
      quiet
    );
  }
  const ownerProcess = processes.find((item) => item.pid === owner.pid);
  if (!ownerProcess || owner.pid !== managedPrimary.pid || !ownerProcess.path || normalizeFile(ownerProcess.path) !== expectedPath) {
    throwValidationError(
      "LISTENER_OWNER_MISMATCH",
      "调试端口所有者不是已验证的 Cursor 可执行文件。",
      { pid: owner.pid, port },
      quiet
    );
  }
  return { processes, main: managedPrimary, owner };
}

function chooseLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function configureTheme(mode) {
  if (!["dark", "light", "system"].includes(mode)) {
    fail("INVALID_MODE", "Cursor 主题模式必须是 dark、light 或 system。");
  }
  assertNoLinks(path.dirname(SETTINGS_PATH), SETTINGS_PATH);
  const restore = fs.existsSync(RESTORE_PATH) ? readJson(RESTORE_PATH) : { schema: 1 };
  if (restore.capturedAppearanceState && restore.settingsPath !== SETTINGS_PATH) fail("RESTORE_TARGET_MISMATCH", "尚有其他 Cursor 配置的恢复记录，请先完成恢复。");
  const original = fs.existsSync(SETTINGS_PATH)
    ? fs.readFileSync(SETTINGS_PATH, "utf8").replace(/^\uFEFF/, "")
    : "{}\n";
  inspect(original);
  if (!restore.capturedAppearanceState) {
    restore.settingsPath = SETTINGS_PATH;
    restore.executable = CURSOR_EXE;
    restore.settingsExisted = fs.existsSync(SETTINGS_PATH);
    restore.extensionExisted = fs.existsSync(EXTENSION_PATH);
    restore.previousValues = Object.fromEntries(
      MANAGED_KEYS.map((key) => [key, jsoncRawValue(original, key)])
    );
    restore.capturedAppearanceState = true;
    restore.capturedAt = new Date().toISOString();
    writeJsonAtomic(RESTORE_PATH, restore);
  }

  deployExtension();

  let updated = original;
  updated = replaceJsoncRaw(updated, "workbench.preferredDarkColorTheme", '"Diana Night"');
  updated = replaceJsoncRaw(updated, "workbench.preferredLightColorTheme", '"Diana Day"');
  if (mode === "light") {
    updated = replaceJsoncRaw(updated, "workbench.colorTheme", '"Diana Day"');
    updated = replaceJsoncRaw(updated, "window.autoDetectColorScheme", "false");
  } else if (mode === "system") {
    updated = replaceJsoncRaw(updated, "window.autoDetectColorScheme", "true");
  } else {
    updated = replaceJsoncRaw(updated, "workbench.colorTheme", '"Diana Night"');
    updated = replaceJsoncRaw(updated, "window.autoDetectColorScheme", "false");
  }
  inspect(updated);
  restore.appliedValues = Object.fromEntries(MANAGED_KEYS.map(key => [key, jsoncRawValue(updated, key)]));
  writeJsonAtomic(RESTORE_PATH, restore);
  ensureDirectory(path.dirname(SETTINGS_PATH));
  fs.writeFileSync(SETTINGS_PATH, updated, "utf8");
  appendEvent("appearance_configured", {
    status: "configured",
    version: EXPECTED_VERSION,
    note: mode
  });
}

function validateExtensionRemovalTarget() {
  assertNoLinks(CONFIG.extensions, EXTENSION_PATH);
  if (path.dirname(EXTENSION_PATH) !== CONFIG.extensions || path.basename(EXTENSION_PATH) !== "lanmengsakura.diana-cursor-theme-0.1.0") fail("UNSAFE_EXTENSION_PATH", "拒绝非 Diana 用户扩展路径。");
}
const EXTENSION_FILES = ["package.json", "themes/diana-night-color-theme.json", "themes/diana-day-color-theme.json"];
function deployExtension() {
  validateExtensionRemovalTarget();
  const existed = fs.existsSync(EXTENSION_PATH);
  for (const relative of EXTENSION_FILES) {
    const source = path.join(EXTENSION_SOURCE, relative), target = path.join(EXTENSION_PATH, relative);
    assertNoLinks(EXTENSION_PATH, target);
    if (existed && (!fs.existsSync(target) || sha256(target) !== sha256(source))) fail("EXTENSION_CONFLICT", "同名 Cursor 主题扩展已有不同内容，本次没有覆盖。");
  }
  if (existed) return;
  for (const relative of EXTENSION_FILES) {
    const target = path.join(EXTENSION_PATH, relative);
    ensureDirectory(path.dirname(target));
    // Byte copy avoids cross-volume EFS metadata propagation on Windows.
    fs.writeFileSync(target, fs.readFileSync(path.join(EXTENSION_SOURCE, relative)));
  }
}
function removeDeployedExtension() {
  validateExtensionRemovalTarget();
  for (const relative of EXTENSION_FILES) {
    const target = path.join(EXTENSION_PATH, relative);
    assertNoLinks(EXTENSION_PATH, target);
    if (fs.existsSync(target) && sha256(target) !== sha256(path.join(EXTENSION_SOURCE, relative))) fail("EXTENSION_CHANGED", "主题扩展在挂载后被修改，已保留文件。");
  }
  for (const relative of EXTENSION_FILES) {
    const target = path.join(EXTENSION_PATH, relative);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
  for (const directory of [path.join(EXTENSION_PATH, "themes"), EXTENSION_PATH]) {
    if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
  }
}
function removeGeneratedSettingsFile() {
  assertNoLinks(path.dirname(SETTINGS_PATH), SETTINGS_PATH);
  if (fs.existsSync(SETTINGS_PATH)) fs.unlinkSync(SETTINGS_PATH);
}

function restoreAppearance() {
  if (!fs.existsSync(RESTORE_PATH)) return;
  assertNoLinks(path.dirname(SETTINGS_PATH), SETTINGS_PATH);
  const restore = readJson(RESTORE_PATH);
  if (restore.capturedAppearanceState && restore.settingsPath !== SETTINGS_PATH) fail("RESTORE_TARGET_MISMATCH", "恢复记录与本次 Cursor 用户配置不一致。");
  const completedCycle = Boolean(restore.capturedAppearanceState);
  if (restore.capturedAppearanceState) {
    let current = fs.existsSync(SETTINGS_PATH)
      ? fs.readFileSync(SETTINGS_PATH, "utf8").replace(/^\uFEFF/, "")
      : "{}\n";
    const restored = restoreValues(current, restore.previousValues ?? {}, restore.appliedValues ?? {});
    current = restored.text;
    restore.preservedUserChanges = restored.conflicts;
    if (!restore.settingsExisted && Object.keys(inspect(current).value).length === 0) {
      if (fs.existsSync(SETTINGS_PATH)) removeGeneratedSettingsFile();
    } else {
      ensureDirectory(path.dirname(SETTINGS_PATH));
      fs.writeFileSync(SETTINGS_PATH, current, "utf8");
    }
    if (!restore.extensionExisted && fs.existsSync(EXTENSION_PATH)) {
      removeDeployedExtension();
    }
  }
  const restoredAt = new Date().toISOString();
  restore.restoredAt = restoredAt;
  if (completedCycle) {
    restore.lastCompletedCycle = {
      capturedAt: restore.capturedAt ?? null,
      restoredAt,
      settingsExisted: Boolean(restore.settingsExisted),
      extensionExisted: Boolean(restore.extensionExisted)
    };
    restore.capturedAppearanceState = false;
    restore.capturedAt = null;
    restore.settingsExisted = null;
    restore.previousValues = {};
    restore.extensionExisted = null;
  }
  writeJsonAtomic(RESTORE_PATH, restore);
  appendEvent("appearance_restored", {
    status: "restored",
    version: EXPECTED_VERSION
  });
}

function dataUri(filename) {
  const target = path.join(ROOT, "assets", filename);
  if (!fs.existsSync(target)) fail("ASSET_MISSING", `Diana 本地素材缺失：${filename}`);
  return `data:image/png;base64,${fs.readFileSync(target).toString("base64")}`;
}

function buildThemeCss() {
  let css = fs.readFileSync(THEME_CSS, "utf8");
  for (const [placeholder, filename] of Object.entries(ASSETS)) {
    css = css.replaceAll(placeholder, dataUri(filename));
  }
  if (/__[A-Z0-9_]+__/.test(css)) fail("CSS_PLACEHOLDER_REMAINS", "主题 CSS 仍包含未解析素材占位符。");
  return css;
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message ?? "CDP error"));
      else pending.resolve(message.result);
    });
    const rejectPending = () => {
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error("CDP WebSocket closed"));
        this.pending.delete(id);
      }
    };
    socket.addEventListener("close", rejectPending);
    socket.addEventListener("error", rejectPending);
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("CDP WebSocket timed out"));
      }, 5000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve(new CdpClient(socket));
      });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("CDP WebSocket failed"));
      });
    });
  }

  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP call timed out: ${method}`));
      }, 8000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) {
    const description = String(
      result.exceptionDetails.exception?.description ??
      result.exceptionDetails.text ??
      "unknown renderer exception"
    ).split("\n", 1)[0].slice(0, 240);
    throw new Error("RENDERER_EVALUATION_FAILED: 未记录页面异常正文。");
  }
  return result.result?.value;
}

async function listTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(1200)
  });
  if (!response.ok) return [];
  const targets = await response.json();
  return Array.isArray(targets) ? targets : [];
}

async function findWorkbenchTarget(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await listTargets(port);
      for (const target of targets) {
        if (target.type !== "page" || !trustedSocket(target.webSocketDebuggerUrl, port)) continue;
        const trustedLocalWorkbench = /^(vscode-file:\/\/vscode-app|file:)/.test(String(target.url ?? "")) && /workbench/i.test(String(target.url ?? ""));
        if (!trustedLocalWorkbench) continue;
        let client;
        try {
          client = await CdpClient.connect(target.webSocketDebuggerUrl);
          const probe = await evaluate(
            client,
            "(() => ({visible: document.visibilityState === 'visible', hasWorkbench: !!document.querySelector('.monaco-workbench'), width: innerWidth, height: innerHeight}))()"
          );
          if (probe?.hasWorkbench && probe.width > 500 && probe.height > 400) {
            return { client, probe };
          }
        } catch {
          // Probe another renderer without logging its URL or contents.
        }
        client?.close();
      }
    } catch {
      // Cursor may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  fail("EXPECTED_RENDERER_NOT_FOUND", "未找到可见且包含 Monaco Workbench 的 Cursor 渲染页。", { port });
}

// The requested setting can be "system", but artwork always needs a resolved
// light/dark mode. Follow the native renderer while its settings watcher settles.
function nativeColorClass(roots) {
  for (const node of roots) {
    if (node?.classList.contains("vs-dark") || node?.classList.contains("hc-black")) return "dark";
    if (node?.classList.contains("vs") || node?.classList.contains("hc-light")) return "light";
  }
  return "other";
}

function effectiveThemeMode(requested, nativeMode, systemDark) {
  if (nativeMode === "dark" || nativeMode === "light") return nativeMode;
  return requested === "system" ? (systemDark ? "dark" : "light") : requested;
}

function verifiedMount(state, requestedMode) {
  const foregroundReady = state?.foregroundExpected
    ? state.foregroundCount === 1 : state?.foregroundCount === 0;
  return Boolean(state?.host && state.chromeCount === 1 && state.styleCount === 1
    && state.pointerEvents === "none" && state.characterLoaded && state.editorAnchored
    && foregroundReady && state.requestedMode === requestedMode
    && state.themeSynchronized && state.themeTokensMatch
    && (requestedMode === "system" || state.effectiveMode === requestedMode));
}

function rendererStateExpression() {
  return `(() => {
    const root = document.documentElement;
    const workbench = document.querySelector('.monaco-workbench');
    const chrome = document.querySelector('#diana-cursor-theme-chrome');
    const character = chrome?.querySelector('.diana-cursor-character');
    const editorLayer = chrome?.querySelector('.diana-cursor-editor-layer');
    const editor = document.querySelector('.agent-panel')
      || document.querySelector('.agent-panel-conversation-shell')
      || document.querySelector('.monaco-workbench .part.editor, .monaco-workbench [data-part="editor"]');
    const sidebar = document.querySelector('nav.ui-sidebar, .ui-sidebar')
      || document.querySelector('.monaco-workbench .part.sidebar, .monaco-workbench [data-part="sidebar"]');
    const colorClass = (${nativeColorClass.toString()})([workbench, document.body, root]);
    const effectiveMode = root.dataset.dianaCursorMode ?? null;
    const surface = getComputedStyle(root).getPropertyValue('--diana-surface').trim().toLowerCase();
    return {
      host: root.classList.contains('diana-cursor-host'),
      chromeCount: document.querySelectorAll('#diana-cursor-theme-chrome').length,
      styleCount: document.querySelectorAll('#diana-cursor-theme-style').length,
      pointerEvents: chrome ? getComputedStyle(chrome).pointerEvents : null,
      characterLoaded: !!character && getComputedStyle(character).backgroundImage.includes('data:image/png'),
      editorFound: !!editor,
      editorAnchored: !!editorLayer && parseFloat(getComputedStyle(editorLayer).width) > 0,
      sidebarFound: !!sidebar,
      foregroundExpected: !!document.querySelector('.agent-panel-conversation-shell'),
      foregroundCount: document.querySelectorAll('[data-diana-cursor-foreground="true"]').length,
      requestedMode: root.dataset.dianaCursorRequestedMode ?? null,
      effectiveMode,
      colorClass,
      themeSynchronized: ['dark', 'light'].includes(colorClass) && colorClass === effectiveMode,
      themeTokensMatch: effectiveMode === 'light' ? surface === '#fbf8f6' : effectiveMode === 'dark' && surface === '#0d0c0f',
      width: innerWidth,
      height: innerHeight,
      rendererVisible: document.visibilityState === 'visible'
    };
  })()`;
}

function injectionExpression(css, mode) {
  return `(() => {
    const workbench = document.querySelector('.monaco-workbench');
    if (!workbench) return { ok: false };
    if (window.__dianaCursorRuntime?.dispose) window.__dianaCursorRuntime.dispose();
    document.querySelectorAll('#diana-cursor-theme-chrome, #diana-cursor-theme-style').forEach((node) => node.remove());
    const root = document.documentElement;
    const requestedMode = ${JSON.stringify(mode)};
    const media = matchMedia('(prefers-color-scheme: dark)');
    const themeRoots = [workbench, document.body, root];
    const nativeMode = ${nativeColorClass.toString()};
    const resolveMode = ${effectiveThemeMode.toString()};
    root.classList.add('diana-cursor-host');
    root.dataset.dianaCursorRequestedMode = requestedMode;
    const syncMode = () => {
      const effective = resolveMode(requestedMode, nativeMode(themeRoots), media.matches);
      if (root.dataset.dianaCursorMode !== effective) root.dataset.dianaCursorMode = effective;
    };
    syncMode();
    const style = document.createElement('style');
    style.id = 'diana-cursor-theme-style';
    style.textContent = ${JSON.stringify(css)};
    document.head.appendChild(style);
    const chrome = document.createElement('div');
    chrome.id = 'diana-cursor-theme-chrome';
    chrome.setAttribute('aria-hidden', 'true');
    const addLayer = (parent, className) => {
      const node = document.createElement('span');
      node.className = className;
      parent.appendChild(node);
      return node;
    };
    const editorLayer = addLayer(chrome, 'diana-cursor-editor-layer');
    addLayer(editorLayer, 'diana-cursor-corner');
    addLayer(editorLayer, 'diana-cursor-upper');
    addLayer(editorLayer, 'diana-cursor-character');
    addLayer(editorLayer, 'diana-cursor-ornaments');
    addLayer(editorLayer, 'diana-cursor-acao');
    addLayer(editorLayer, 'diana-cursor-doodle');
    const sidebarLayer = addLayer(chrome, 'diana-cursor-sidebar-layer');
    document.body.appendChild(chrome);
    const updateBox = (element, layer) => {
      if (!element || !layer) return;
      const rootBox = chrome.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      layer.style.setProperty('--diana-part-left', (box.left - rootBox.left) + 'px');
      layer.style.setProperty('--diana-part-top', (box.top - rootBox.top) + 'px');
      layer.style.setProperty('--diana-part-width', box.width + 'px');
      layer.style.setProperty('--diana-part-height', box.height + 'px');
    };
    const findEditor = () =>
      document.querySelector('.agent-panel') ||
      document.querySelector('.agent-panel-conversation-shell[data-agent-panel-conversation-shell]') ||
      document.querySelector('.agent-panel-conversation-shell') ||
      document.querySelector('.monaco-workbench .part.editor, .monaco-workbench [data-part="editor"]');
    const findSidebar = () =>
      document.querySelector('nav.ui-sidebar') ||
      document.querySelector('.ui-sidebar') ||
      document.querySelector('.monaco-workbench .part.sidebar, .monaco-workbench [data-part="sidebar"]');
    const markForeground = () => {
      const foreground =
        document.querySelector('.agent-panel-conversation-shell[data-agent-panel-conversation-shell]') ||
        document.querySelector('.agent-panel-conversation-shell');
      document.querySelectorAll('[data-diana-cursor-foreground="true"]').forEach((node) => {
        if (node !== foreground) node.removeAttribute('data-diana-cursor-foreground');
      });
      foreground?.setAttribute('data-diana-cursor-foreground', 'true');
      return foreground;
    };
    const update = () => {
      syncMode();
      const nativeEditor = findEditor();
      const nativeSidebar = findSidebar();
      const editorLayer = chrome.querySelector('.diana-cursor-editor-layer');
      const sidebarLayer = chrome.querySelector('.diana-cursor-sidebar-layer');
      if (nativeEditor) {
        updateBox(nativeEditor, editorLayer);
      } else {
        editorLayer.style.setProperty('--diana-part-left', '0px');
        editorLayer.style.setProperty('--diana-part-top', '36px');
        editorLayer.style.setProperty('--diana-part-width', innerWidth + 'px');
        editorLayer.style.setProperty('--diana-part-height', Math.max(0, innerHeight - 36) + 'px');
      }
      if (nativeSidebar) {
        updateBox(nativeSidebar, sidebarLayer);
      } else {
        const rootBox = chrome.getBoundingClientRect();
        sidebarLayer.style.setProperty('--diana-part-left', '0px');
        sidebarLayer.style.setProperty('--diana-part-top', '0px');
        sidebarLayer.style.setProperty('--diana-part-width', Math.min(320, rootBox.width * 0.25) + 'px');
        sidebarLayer.style.setProperty('--diana-part-height', rootBox.height + 'px');
      }
      markForeground();
    };
    update();
    const resize = new ResizeObserver(update);
    resize.observe(workbench);
    const editor = findEditor();
    const sidebar = findSidebar();
    if (editor) resize.observe(editor);
    if (sidebar) resize.observe(sidebar);
    let mutationFrame = 0;
    const mutations = new MutationObserver(() => {
      if (mutationFrame) return;
      mutationFrame = requestAnimationFrame(() => {
        mutationFrame = 0;
        update();
      });
    });
    mutations.observe(workbench, { childList: true, subtree: true });
    // Watch only native theme roots, not every class change in the conversation.
    const appearance = new MutationObserver(syncMode);
    for (const node of themeRoots) if (node) appearance.observe(node, { attributes: true, attributeFilter: ['class'] });
    media.addEventListener('change', syncMode);
    window.addEventListener('resize', update);
    window.__dianaCursorRuntime = {
      requestedMode,
      dispose() {
        resize.disconnect();
        mutations.disconnect();
        appearance.disconnect();
        media.removeEventListener('change', syncMode);
        if (mutationFrame) cancelAnimationFrame(mutationFrame);
        window.removeEventListener('resize', update);
        document.querySelectorAll('[data-diana-cursor-foreground="true"]').forEach((node) => {
          node.removeAttribute('data-diana-cursor-foreground');
        });
        chrome.remove();
        style.remove();
        document.documentElement.classList.remove('diana-cursor-host');
        delete document.documentElement.dataset.dianaCursorMode;
        delete document.documentElement.dataset.dianaCursorRequestedMode;
        delete window.__dianaCursorRuntime;
      }
    };
    return ${rendererStateExpression()};
  })()`;
}

function disableExpression() {
  return `(() => {
    if (window.__dianaCursorRuntime?.dispose) window.__dianaCursorRuntime.dispose();
    document.querySelectorAll('#diana-cursor-theme-chrome, #diana-cursor-theme-style').forEach((node) => node.remove());
    document.querySelectorAll('[data-diana-cursor-foreground="true"]').forEach((node) => {
      node.removeAttribute('data-diana-cursor-foreground');
    });
    document.documentElement.classList.remove('diana-cursor-host');
    delete document.documentElement.dataset.dianaCursorMode;
    delete document.documentElement.dataset.dianaCursorRequestedMode;
    return {
      host: document.documentElement.classList.contains('diana-cursor-host'),
      chromeCount: document.querySelectorAll('#diana-cursor-theme-chrome').length,
      styleCount: document.querySelectorAll('#diana-cursor-theme-style').length
    };
  })()`;
}

async function connectManagedSession(session, quiet = false) {
  if (session.adapterVersion !== ADAPTER_VERSION || session.version !== EXPECTED_VERSION) fail("SESSION_MISMATCH", "会话版本与本次适配器不一致。");
  const validated = validateManagedSession(session.port, quiet);
  if (validated.main.pid !== session.pid) fail("SESSION_PID_MISMATCH", "调试进程不属于记录中的会话。");
  const target = await findWorkbenchTarget(session.port, 8000);
  return { ...validated, ...target };
}

async function mountExisting(session, mode) {
  const connection = await connectManagedSession(session);
  let mounted;
  try {
    configureTheme(mode);
    mounted = await evaluate(connection.client, injectionExpression(buildThemeCss(), mode));
    // Native settings are applied asynchronously. Do not announce MOUNTED while
    // a previous native palette is still active, or while artwork is mismatched.
    const deadline = Date.now() + 5000;
    while (!verifiedMount(mounted, mode) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 150));
      mounted = await evaluate(connection.client, rendererStateExpression());
    }
  } finally {
    connection.client.close();
  }
  if (!verifiedMount(mounted, mode)) {
    const checks = {
      host: Boolean(mounted?.host),
      chromeCount: mounted?.chromeCount ?? null,
      styleCount: mounted?.styleCount ?? null,
      pointerEvents: mounted?.pointerEvents ?? null,
      characterLoaded: Boolean(mounted?.characterLoaded),
      editorFound: Boolean(mounted?.editorFound),
      editorAnchored: Boolean(mounted?.editorAnchored),
      foregroundExpected: Boolean(mounted?.foregroundExpected),
      foregroundCount: mounted?.foregroundCount ?? null,
      requestedMode: mode,
      effectiveMode: mounted?.effectiveMode ?? null,
      nativeMode: mounted?.colorClass ?? null,
      themeSynchronized: Boolean(mounted?.themeSynchronized),
      themeTokensMatch: Boolean(mounted?.themeTokensMatch)
    };
    fail("MOUNT_VERIFICATION_FAILED", `Cursor 视觉层写入后未通过结构复核：${JSON.stringify(checks)}`, {
      pid: connection.main.pid,
      port: session.port
    });
  }
  const updated = {
    ...session,
    status: "mounted",
    mode,
    pid: connection.main.pid,
    listenerPid: connection.owner.pid,
    mountedAt: new Date().toISOString(),
    viewport: { width: mounted.width, height: mounted.height },
    colorClass: mounted.colorClass,
    effectiveMode: mounted.effectiveMode,
    themeSynchronized: mounted.themeSynchronized
  };
  writeJsonAtomic(SESSION_PATH, updated);
  appendEvent("mounted", {
    status: "mounted",
    version: EXPECTED_VERSION,
    pid: updated.pid,
    port: updated.port,
    note: `${mode}:${mounted.colorClass}`
  });
  return updated;
}

async function start(mode) {
  buildThemeCss();
  const trust = trustReport();
  const existing = cursorProcesses();
  if (existing.length > 0) {
    fail("CURSOR_ALREADY_RUNNING", "普通 Cursor 仍在运行；为避免单实例忽略调试参数，本次没有启动。", {
      version: trust.fileVersion
    });
  }
  configureTheme(mode);
  const port = await chooseLoopbackPort();
  if (!Number.isInteger(port) || port < 1024) fail("PORT_SELECTION_FAILED", "无法选择随机高位端口。");
  const child = spawn(
    CURSOR_EXE,
    [
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${port}`,
      "--new-window"
    ],
    { detached: true, stdio: "ignore", windowsHide: false }
  );
  await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  child.unref();
  appendEvent("cursor_started", {
    status: "starting",
    version: trust.fileVersion,
    pid: child.pid,
    port
  });
  const session = {
    schema: 1,
    adapterVersion: ADAPTER_VERSION,
    status: "starting",
    version: trust.fileVersion,
    pid: child.pid,
    port,
    mode,
    startedAt: new Date().toISOString()
  };
  writeJsonAtomic(SESSION_PATH, session);

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      validateManagedSession(port, true);
      break;
    } catch (error) {
      if (!["MANAGED_CURSOR_NOT_FOUND", "LISTENER_NOT_FOUND"].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  return mountExisting(session, mode);
}

async function status() {
  if (!fs.existsSync(SESSION_PATH)) {
    return { status: "no_session", running: cursorProcesses().length > 0 };
  }
  const session = readJson(SESSION_PATH);
  const processes = cursorProcesses();
  const managedProcessPresent = processes.some(
    (item) => item.primary && item.hasLoopback && item.debugPort === session.port
  );
  if (!managedProcessPresent) {
    return {
      status: session.status === "restored"
        ? "restored"
        : (processes.length > 0 ? "unmanaged_cursor_running" : "stopped_requires_restore"),
      running: processes.length > 0,
      managedSession: false
    };
  }
  try {
    const connection = await connectManagedSession(session, true);
    let state;
    try { state = await evaluate(connection.client, rendererStateExpression()); }
    finally { connection.client.close(); }
    const statusName = verifiedMount(state, session.mode)
      ? "mounted"
      : (!state.host && state.chromeCount === 0 && state.styleCount === 0 ? "disabled" : "incomplete");
    return {
      status: statusName,
      running: true,
      pid: connection.main.pid,
      port: session.port,
      mode: session.mode,
      effectiveMode: state.effectiveMode,
      themeSynchronized: state.themeSynchronized,
      themeTokensMatch: state.themeTokensMatch,
      colorClass: state.colorClass,
      pointerEvents: state.pointerEvents,
      characterLoaded: state.characterLoaded,
      editorFound: state.editorFound,
      editorAnchored: state.editorAnchored,
      sidebarFound: state.sidebarFound,
      foregroundExpected: state.foregroundExpected,
      foregroundCount: state.foregroundCount
    };
  } catch (error) {
    return { status: "unreachable", running: cursorProcesses().length > 0, errorCode: error.code ?? "STATUS_FAILED" };
  }
}

async function disable() {
  if (!fs.existsSync(SESSION_PATH)) return { status: "no_session" };
  const session = readJson(SESSION_PATH);
  const connection = await connectManagedSession(session);
  let disabled;
  try {
    disabled = await evaluate(connection.client, disableExpression());
  } finally {
    connection.client.close();
  }
  if (disabled.host || disabled.chromeCount !== 0 || disabled.styleCount !== 0) {
    fail("DISABLE_VERIFICATION_FAILED", "Cursor 视觉层撤下后未通过复核。", {
      pid: connection.main.pid,
      port: session.port
    });
  }
  const updated = { ...session, status: "disabled", disabledAt: new Date().toISOString() };
  writeJsonAtomic(SESSION_PATH, updated);
  appendEvent("disabled", {
    status: "disabled",
    version: EXPECTED_VERSION,
    pid: connection.main.pid,
    port: session.port
  });
  return updated;
}

async function restore() {
  let disableResult = null;
  const running = cursorProcesses();
  if (fs.existsSync(SESSION_PATH) && running.length > 0) {
    disableResult = await disable();
    const session = readJson(SESSION_PATH);
    writeJsonAtomic(SESSION_PATH, {
      ...session,
      status: "restore_ready_for_exit",
      restoreRequestedAt: new Date().toISOString()
    });
    return { status: "restore_ready_for_exit", running: true, disableResult };
  }
  if (running.length > 0) {
    fail("CURSOR_STILL_RUNNING", "必须先正常退出所有 Cursor 进程，再恢复磁盘状态。");
  }
  restoreAppearance();
  if (fs.existsSync(SESSION_PATH)) {
    const session = readJson(SESSION_PATH);
    writeJsonAtomic(SESSION_PATH, {
      ...session,
      status: "restored",
      restoredAt: new Date().toISOString()
    });
  }
  return { status: "restored", running: false, disableResult };
}

async function main() {
  const action = process.argv[2] ?? "self-test";
  const mode = process.argv[3] ?? "dark";
  if (!["self-test", "start", "apply", "status", "disable", "restore"].includes(action)) throw new Error("UNKNOWN_ACTION");
  checkPrerequisites(CONFIG, action);
  const files = verifyBundle(ROOT);
  let result;
  if (action === "self-test") { buildThemeCss(); result = { status: "ok", adapterVersion: ADAPTER_VERSION, files, runtimeTested: false }; }
  else if (action === "start") result = await start(mode);
  else if (action === "apply") {
    if (!fs.existsSync(SESSION_PATH)) throw new Error("SESSION_MISSING");
    result = await mountExisting(readJson(SESSION_PATH), mode);
  } else if (action === "status") result = await status();
  else if (action === "disable") result = await disable();
  else result = await restore();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
export { configureTheme, restoreAppearance, injectionExpression, disableExpression, buildThemeCss,
  nativeColorClass, effectiveThemeMode, rendererStateExpression, verifiedMount };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  process.stderr.write(`${error.code ?? "ADAPTER_FAILED"}: ${error.message}\n`);
  process.exitCode = 1;
});
