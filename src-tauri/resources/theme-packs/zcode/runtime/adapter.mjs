import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const STATE_DIRECTORY = join(ROOT, "state");
const SESSION_PATH = join(STATE_DIRECTORY, "session.json");
const LOG_PATH = join(ROOT, "logs", "events.jsonl");
const ZCODE_EXE = process.env.DIANA_ZCODE_EXE || "C:\\Program Files\\ZCode\\ZCode.exe";
const EXPECTED_FILE_VERSION = "3.6.5.4145";
const EXPECTED_PRODUCT_VERSION = "3.6.5.4145";
const EXPECTED_SIGNER_THUMBPRINT = "6F7B147DC610F91425750D2449C46002C3385BCF";
const LOOPBACK = "127.0.0.1";
const ADAPTER_VERSION = "experimental-3.6.5-v3";

function now() {
  return new Date().toISOString();
}

function writeEvent(event, details = {}) {
  const safeDetails = {};
  for (const key of ["status", "pid", "port", "version", "theme", "code"]) {
    if (details[key] !== undefined) safeDetails[key] = details[key];
  }
  appendFileSync(LOG_PATH, `${JSON.stringify({ at: now(), event, ...safeDetails })}\n`, "utf8");
}

function writeSession(session) {
  writeFileSync(SESSION_PATH, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

function readSession() {
  if (!existsSync(SESSION_PATH)) return null;
  return JSON.parse(readFileSync(SESSION_PATH, "utf8"));
}

function encodedPowerShell(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function powerShellCandidates() {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
  return [...new Set([
    process.env.DIANA_POWERSHELL_EXE,
    join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    "powershell.exe",
    "pwsh.exe"
  ].filter(Boolean))];
}

function powerShellEnvironment(executable) {
  const childEnvironment = { ...process.env };
  const executableName = executable.replaceAll("/", "\\").split("\\").at(-1)?.toLowerCase();
  if (executableName === "powershell.exe") {
    const systemRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    childEnvironment.PSModulePath = [
      join(programFiles, "WindowsPowerShell", "Modules"),
      join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "Modules")
    ].join(";");
  }
  return childEnvironment;
}

function runPowerShellJson(script) {
  const utf8Script = `
$dianaUtf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $dianaUtf8
$OutputEncoding = $dianaUtf8
${script}
`;
  for (const executable of powerShellCandidates()) {
    const result = spawnSync(
      executable,
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedPowerShell(utf8Script)],
      { encoding: "utf8", windowsHide: true, env: powerShellEnvironment(executable) }
    );
    if (result.error?.code === "ENOENT") continue;
    if (result.error || result.status !== 0) throw new Error("POWERSHELL_PREFLIGHT_FAILED");
    const output = String(result.stdout || "").replaceAll("\0", "").replace(/^\uFEFF/, "").trim();
    if (!output) return null;
    try {
      return JSON.parse(output);
    } catch {
      throw new Error("POWERSHELL_PREFLIGHT_INVALID_JSON");
    }
  }
  throw new Error("POWERSHELL_NOT_FOUND");
}

function inspectMachine() {
  const exeLiteral = ZCODE_EXE.replaceAll("'", "''");
  return runPowerShellJson(`
$ErrorActionPreference = 'Stop'
$exe = '${exeLiteral}'
if (-not (Test-Path -LiteralPath $exe)) { throw 'ZCODE_EXE_NOT_FOUND' }
$item = Get-Item -LiteralPath $exe
$signature = Get-AuthenticodeSignature -LiteralPath $exe
$processes = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -ieq 'ZCode.exe' -and $_.ExecutablePath -ieq $exe
} | ForEach-Object {
  [pscustomobject]@{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId }
})
[pscustomobject]@{
  fileVersion = $item.VersionInfo.FileVersion
  productVersion = $item.VersionInfo.ProductVersion
  signature = [string]$signature.Status
  signer = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { '' }
  signerThumbprint = if ($signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { '' }
  processes = $processes
} | ConvertTo-Json -Depth 5 -Compress
`);
}

function inspectListener(port) {
  return runPowerShellJson(`
$ErrorActionPreference = 'Stop'
$connections = @(Get-NetTCPConnection -State Listen -LocalPort ${Number(port)} -ErrorAction SilentlyContinue)
$items = @($connections | ForEach-Object {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" -ErrorAction SilentlyContinue
  [pscustomobject]@{
    address = [string]$_.LocalAddress
    port = [int]$_.LocalPort
    pid = [int]$_.OwningProcess
    executablePath = if ($process) { [string]$process.ExecutablePath } else { '' }
    hasWindow = if ($process) { [bool]((Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).MainWindowHandle) } else { $false }
  }
})
@($items) | ConvertTo-Json -Depth 4 -Compress
`);
}

function assertPreflight(machine) {
  machine.processes = Array.isArray(machine.processes)
    ? machine.processes
    : machine.processes
      ? [machine.processes]
      : [];
  if (machine.fileVersion !== EXPECTED_FILE_VERSION || machine.productVersion !== EXPECTED_PRODUCT_VERSION) {
    throw new Error("ZCODE_VERSION_MISMATCH");
  }
  if (machine.signature !== "Valid" || machine.signerThumbprint !== EXPECTED_SIGNER_THUMBPRINT) {
    throw new Error("ZCODE_SIGNATURE_MISMATCH");
  }
  if (machine.processes.length > 0) throw new Error("ZCODE_ALREADY_RUNNING");
}

function preflight() {
  const machine = inspectMachine();
  assertPreflight(machine);
  console.log(JSON.stringify({
    status: "ready",
    adapterVersion: ADAPTER_VERSION,
    version: machine.fileVersion,
    signature: machine.signature
  }, null, 2));
}

async function chooseLoopbackPort() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const port = await new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen({ host: LOOPBACK, port: 0, exclusive: true }, () => {
        const address = server.address();
        const selected = typeof address === "object" && address ? address.port : 0;
        server.close((error) => error ? reject(error) : resolve(selected));
      });
    });
    if (port >= 49152 && port <= 65535) return port;
  }
  throw new Error("NO_HIGH_LOOPBACK_PORT");
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchTargets(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${LOOPBACK}:${port}/json/list`, { cache: "no-store" });
      if (response.ok) {
        const targets = await response.json();
        if (Array.isArray(targets) && targets.length > 0) return targets;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(350);
  }
  throw new Error(lastError ? "CDP_ENDPOINT_TIMEOUT" : "CDP_NO_TARGETS");
}

async function waitForRendererTarget(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchTargets(port, 2_000);
      return selectRendererTarget(targets);
    } catch {
      await sleep(350);
    }
  }
  throw new Error("EXPECTED_RENDERER_TIMEOUT");
}

function selectRendererTarget(targets) {
  const pages = targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
  const renderer = pages.find((target) =>
    typeof target.url === "string"
      && target.url.startsWith("file://")
      && target.url.includes("/out/renderer/index.html")
  );
  if (!renderer) throw new Error("EXPECTED_RENDERER_NOT_FOUND");
  return renderer;
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      const timer = setTimeout(() => reject(new Error("CDP_WEBSOCKET_TIMEOUT")), 12_000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        this.socket = socket;
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("CDP_WEBSOCKET_FAILED"));
      }, { once: true });
      socket.addEventListener("message", (event) => {
        let message;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!message.id || !this.pending.has(message.id)) return;
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error("CDP_COMMAND_FAILED"));
        else pending.resolve(message.result);
      });
    });
  }

  call(method, params = {}, timeoutMs = 45_000) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("CDP_NOT_CONNECTED"));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("CDP_COMMAND_TIMEOUT"));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close();
  }
}

function dataUrl(name) {
  const bytes = readFileSync(join(ROOT, "assets", name));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function buildRuntimeExpression(requestedTheme) {
  const payload = {
    adapterVersion: ADAPTER_VERSION,
    requestedTheme,
    css: readFileSync(join(ROOT, "theme.css"), "utf8"),
    assets: {
      characterDark: dataUrl("diana-night-v3.png"),
      characterLight: dataUrl("diana-corner-cutout-v2.png"),
      doodle: dataUrl("diana-doodle-chalk-v2-approved.png"),
      upper: dataUrl("diana-line-art-approved-upper.png"),
      corner: dataUrl("diana-left-top-detailed-corner-mask-v7.png"),
      star: dataUrl("diana-hand-star-reference-v2.png"),
      candyWrapped: dataUrl("diana-candy-wrapped-v1.png"),
      candyLollipop: dataUrl("diana-candy-lollipop-v1.png"),
      acaoHeart: dataUrl("acao-heart-v3.png"),
      acaoCheer: dataUrl("acao-cheer-v1.png")
    }
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  return readFileSync(join(ROOT, "runtime-template.js"), "utf8")
    .replace("__DIANA_PAYLOAD_BASE64__", encodedPayload);
}

async function evaluate(target, expression) {
  const client = new CdpClient(target.webSocketDebuggerUrl);
  try {
    await client.connect();
    await client.call("Runtime.enable");
    const result = await client.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false
    }, 90_000);
    if (result.exceptionDetails) throw new Error("RUNTIME_EVALUATION_FAILED");
    return result.result?.value;
  } finally {
    client.close();
  }
}

function normalizeListeners(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function verifyListener(port) {
  const listeners = normalizeListeners(inspectListener(port));
  if (listeners.length === 0) throw new Error("LISTENER_CLOSED");
  if (listeners.length !== 1) throw new Error("UNEXPECTED_LISTENER_COUNT");
  const listener = listeners[0];
  if (listener.address !== LOOPBACK || listener.port !== port) throw new Error("NON_LOOPBACK_LISTENER");
  if (listener.executablePath.toLowerCase() !== ZCODE_EXE.toLowerCase()) {
    throw new Error("LISTENER_OWNER_MISMATCH");
  }
  if (!listener.hasWindow) throw new Error("VISIBLE_ZCODE_WINDOW_NOT_FOUND");
  return listener;
}

async function startTheme(requestedTheme) {
  const machine = inspectMachine();
  assertPreflight(machine);
  const port = await chooseLoopbackPort();
  const args = [
    `--remote-debugging-address=${LOOPBACK}`,
    `--remote-debugging-port=${port}`
  ];
  const child = spawn(ZCODE_EXE, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();

  const session = {
    adapterVersion: ADAPTER_VERSION,
    createdAt: now(),
    updatedAt: now(),
    status: "launching",
    executable: ZCODE_EXE,
    version: machine.fileVersion,
    pid: child.pid,
    address: LOOPBACK,
    port,
    theme: requestedTheme,
    appFilesModified: false,
    persistenceCreated: false
  };
  writeSession(session);
  writeEvent("launch_requested", { status: session.status, pid: child.pid, port, version: machine.fileVersion, theme: requestedTheme });

  const target = await waitForRendererTarget(port);
  const listener = verifyListener(port);
  const mounted = await evaluate(target, buildRuntimeExpression(requestedTheme));
  if (!mounted?.mounted || mounted.adapterVersion !== ADAPTER_VERSION) {
    throw new Error("MOUNT_STATUS_INVALID");
  }

  Object.assign(session, {
    updatedAt: now(),
    status: "mounted",
    pid: listener.pid,
    workspace: mounted.workspace,
    rootTheme: mounted.rootTheme
  });
  writeSession(session);
  writeEvent("theme_mounted", { status: session.status, pid: session.pid, port, version: session.version, theme: requestedTheme });
  console.log(JSON.stringify({
    status: session.status,
    pid: session.pid,
    address: session.address,
    port: session.port,
    version: session.version,
    theme: session.theme,
    workspace: session.workspace,
    note: "The debugging endpoint remains active until every experimental ZCode process exits."
  }, null, 2));
}

async function applyTheme(requestedTheme) {
  const session = readSession();
  if (!session?.port) throw new Error("NO_ACTIVE_SESSION");
  const listener = verifyListener(session.port);
  const target = await waitForRendererTarget(session.port, 8_000);
  const mounted = await evaluate(target, buildRuntimeExpression(requestedTheme));
  if (!mounted?.mounted || mounted.adapterVersion !== ADAPTER_VERSION) {
    throw new Error("MOUNT_STATUS_INVALID");
  }
  Object.assign(session, {
    adapterVersion: ADAPTER_VERSION,
    updatedAt: now(),
    status: "mounted",
    pid: listener.pid,
    theme: requestedTheme,
    workspace: mounted.workspace,
    rootTheme: mounted.rootTheme
  });
  writeSession(session);
  writeEvent("theme_reapplied", {
    status: session.status,
    pid: session.pid,
    port: session.port,
    version: session.version,
    theme: requestedTheme
  });
  console.log(JSON.stringify({
    status: session.status,
    adapterVersion: ADAPTER_VERSION,
    pid: session.pid,
    theme: session.theme,
    rootTheme: session.rootTheme,
    workspace: session.workspace
  }, null, 2));
}

async function disableTheme() {
  const session = readSession();
  if (!session?.port) {
    console.log(JSON.stringify({ status: "no_session", changed: false }, null, 2));
    return;
  }
  try {
    verifyListener(session.port);
    const target = selectRendererTarget(await fetchTargets(session.port, 8_000));
    const result = await evaluate(target, `(() => {
      const controller = globalThis.__DIANA_ZCODE_THEME__;
      if (controller && typeof controller.disable === "function") return controller.disable();
      document.getElementById("diana-zcode-runtime-style")?.remove();
      document.getElementById("diana-zcode-chrome")?.remove();
      document.documentElement.classList.remove("diana-zcode-host");
      return { disabled: true, fallback: true };
    })()`);
    session.updatedAt = now();
    session.status = "disabled";
    writeSession(session);
    writeEvent("theme_disabled", { status: session.status, pid: session.pid, port: session.port, version: session.version });
    console.log(JSON.stringify({ status: session.status, changed: Boolean(result?.disabled) }, null, 2));
  } catch {
    session.updatedAt = now();
    session.status = "endpoint_unavailable";
    writeSession(session);
    writeEvent("disable_endpoint_unavailable", { status: session.status, pid: session.pid, port: session.port, version: session.version });
    console.log(JSON.stringify({
      status: session.status,
      changed: false,
      note: "No experimental endpoint is reachable. A normally launched ZCode cannot retain this injected theme."
    }, null, 2));
  }
}

async function verifyTheme() {
  const session = readSession();
  if (!session?.port) throw new Error("NO_ACTIVE_SESSION");
  const listener = verifyListener(session.port);
  const target = await waitForRendererTarget(session.port, 8_000);
  const result = await evaluate(target, `(() => {
    const controller = globalThis.__DIANA_ZCODE_THEME__;
    const chrome = document.getElementById("diana-zcode-chrome");
    const style = document.getElementById("diana-zcode-runtime-style");
    const workspace = document.querySelector("[data-diana-zcode-workspace='true']");
    const foreground = document.querySelector(".diana-zcode-foreground");
    const workspaceBounds = workspace?.getBoundingClientRect();
    const focusTarget = [...document.querySelectorAll(
      "textarea:not(:disabled), button:not(:disabled), input:not(:disabled), [tabindex='0']"
    )].find((element) => {
      if (!(element instanceof HTMLElement) || !workspaceBounds) return false;
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return bounds.width > 0
        && bounds.height > 0
        && bounds.left >= workspaceBounds.left
        && bounds.right <= workspaceBounds.right
        && bounds.top >= workspaceBounds.top
        && bounds.bottom <= workspaceBounds.bottom
        && style.visibility !== "hidden"
        && style.display !== "none";
    });
    const previousActive = document.activeElement;
    if (focusTarget instanceof HTMLElement) focusTarget.focus({ preventScroll: true });
    const keyboardTargetReachable = Boolean(focusTarget && document.activeElement === focusTarget);
    if (focusTarget instanceof HTMLElement) focusTarget.blur();
    if (previousActive instanceof HTMLElement) previousActive.focus({ preventScroll: true });
    const rect = workspace?.getBoundingClientRect();
    const pointTarget = rect
      ? document.elementFromPoint(Math.max(0, rect.right - 24), Math.max(0, rect.bottom - 24))
      : null;
    return {
      adapterVersion: controller?.adapterVersion || null,
      host: document.documentElement.classList.contains("diana-zcode-host"),
      rootTheme: document.documentElement.classList.contains("theme-zai-light") ? "light" : "dark",
      styleCount: style ? 1 : 0,
      chromeCount: chrome ? 1 : 0,
      foregroundCount: foreground ? 1 : 0,
      artworkNodeCount: chrome?.querySelectorAll("span").length || 0,
      pointerSafe: Boolean(chrome && getComputedStyle(chrome).pointerEvents === "none"),
      pointPassesThrough: Boolean(pointTarget && !chrome?.contains(pointTarget)),
      keyboardTargetReachable,
      workspace: rect ? {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      } : null,
      documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  })()`);
  const passed = result?.adapterVersion === ADAPTER_VERSION
    && result.host
    && result.styleCount === 1
    && result.chromeCount === 1
    && result.foregroundCount === 1
    && result.artworkNodeCount === 11
    && result.pointerSafe
    && result.pointPassesThrough
    && result.keyboardTargetReachable
    && !result.documentOverflowX;
  writeEvent("theme_verified", {
    status: passed ? "passed" : "failed",
    pid: listener.pid,
    port: session.port,
    version: session.version,
    theme: result?.rootTheme
  });
  console.log(JSON.stringify({ status: passed ? "passed" : "failed", ...result }, null, 2));
  if (!passed) process.exitCode = 1;
}

async function probeLayout() {
  const session = readSession();
  if (!session?.port) throw new Error("NO_ACTIVE_SESSION");
  verifyListener(session.port);
  const target = await waitForRendererTarget(session.port, 8_000);
  const result = await evaluate(target, `(() => {
    const workspace = document.querySelector("[data-diana-zcode-workspace='true']");
    const input = workspace?.querySelector("textarea, [contenteditable='true'], input:not([type='hidden'])");
    if (!workspace || !input) return { workspace: Boolean(workspace), input: Boolean(input), layers: [] };
    const workspaceRect = workspace.getBoundingClientRect();
    const layers = [];
    let current = input;
    while (current && current !== workspace.parentElement) {
      const rect = current.getBoundingClientRect();
      const style = getComputedStyle(current);
      layers.push({
        depth: layers.length,
        tag: current.tagName.toLowerCase(),
        directWorkspaceChild: current.parentElement === workspace,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        coversWorkspace: rect.width >= workspaceRect.width * .95 && rect.height >= workspaceRect.height * .95,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage === "none" ? "none" : "present",
        position: style.position,
        zIndex: style.zIndex,
        isolation: style.isolation,
        opacity: style.opacity
      });
      if (current === workspace) break;
      current = current.parentElement;
    }
    const chrome = document.getElementById("diana-zcode-chrome");
    const artwork = chrome ? [chrome, ...chrome.querySelectorAll("span")].map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        role: element.id === "diana-zcode-chrome" ? "chrome" : element.className,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        zIndex: style.zIndex,
        backgroundImage: style.backgroundImage === "none" ? "none" : "present",
        maskImage: style.maskImage === "none" ? "none" : "present"
      };
    }) : [];
    return {
      workspace: true,
      input: true,
      workspaceSize: [Math.round(workspaceRect.width), Math.round(workspaceRect.height)],
      layers,
      artwork
    };
  })()`);
  console.log(JSON.stringify(result, null, 2));
}

async function probeRail() {
  const session = readSession();
  if (!session?.port) throw new Error("NO_ACTIVE_SESSION");
  verifyListener(session.port);
  const target = await waitForRendererTarget(session.port, 8_000);
  const result = await evaluate(target, `(() => {
    const workspace = document.querySelector("[data-diana-zcode-workspace='true']");
    if (!workspace) return { found: false };
    const workspaceRect = workspace.getBoundingClientRect();
    const candidates = [...document.querySelectorAll("nav, aside, div")]
      .map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
        buttons: [...element.querySelectorAll("button")].filter((button) => {
          const buttonRect = button.getBoundingClientRect();
          return buttonRect.left >= workspaceRect.left
            && buttonRect.left <= workspaceRect.left + 90
            && buttonRect.width > 0
            && buttonRect.width <= 90;
        })
      }))
      .filter(({ rect, buttons }) => buttons.length >= 4
        && rect.left >= workspaceRect.left
        && rect.left <= workspaceRect.left + 90
        && rect.width > 0
        && rect.width <= 90
        && rect.height >= workspaceRect.height * .45)
      .sort((left, right) => left.rect.width - right.rect.width
        || left.rect.height - right.rect.height
        || right.buttons.length - left.buttons.length);
    const match = candidates[0];
    if (!match) {
      const edgeElements = [...document.querySelectorAll("*")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const before = getComputedStyle(element, "::before");
          const after = getComputedStyle(element, "::after");
          return { element, rect, style, before, after };
        })
        .filter(({ element, rect, style }) => rect.width > 0
          && rect.width <= 90
          && rect.height > 0
          && rect.height <= 40
          && rect.left >= workspaceRect.left
          && rect.left <= workspaceRect.left + 90
          && rect.bottom >= workspaceRect.top
          && rect.top <= workspaceRect.bottom
          && style.visibility !== "hidden"
          && !element.closest("#diana-zcode-chrome"))
        .slice(0, 120)
        .map(({ element, rect, style, before, after }) => ({
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          leftOffset: Math.round(rect.left - workspaceRect.left),
          topOffset: Math.round(rect.top - workspaceRect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          position: style.position,
          zIndex: style.zIndex,
          backgroundColor: style.backgroundColor,
          borderTop: style.borderTop,
          borderLeft: style.borderLeft,
          boxShadow: style.boxShadow,
          opacity: style.opacity,
          transform: style.transform,
          pointerEvents: style.pointerEvents,
          backgroundImage: style.backgroundImage === "none" ? "none" : "present",
          maskImage: style.maskImage === "none" ? "none" : "present",
          beforeContent: before.content,
          beforeBackground: before.backgroundColor,
          beforeBorderTop: before.borderTop,
          afterContent: after.content,
          afterBackground: after.backgroundColor,
          afterBorderTop: after.borderTop
        }));
      const maskElements = [...document.querySelectorAll("[class*='mask'], [style*='mask']")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return { element, rect, style };
        })
        .filter(({ element, rect }) => rect.width > 0
          && rect.height > 0
          && rect.left <= workspaceRect.left + 100
          && rect.right >= workspaceRect.left
          && !element.closest("#diana-zcode-chrome"))
        .slice(0, 20)
        .map(({ element, rect, style }) => ({
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          leftOffset: Math.round(rect.left - workspaceRect.left),
          topOffset: Math.round(rect.top - workspaceRect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          position: style.position,
          zIndex: style.zIndex,
          backgroundImage: style.backgroundImage === "none" ? "none" : "present",
          maskImage: style.maskImage === "none" ? "none" : "present",
          maskPosition: style.maskPosition,
          maskSize: style.maskSize
        }));
      const tallEdgeElements = [...document.querySelectorAll("*")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return { element, rect, style };
        })
        .filter(({ element, rect, style }) => rect.width > 0
          && rect.width <= 100
          && rect.height >= 80
          && rect.left >= workspaceRect.left
          && rect.left <= workspaceRect.left + 100
          && rect.bottom >= workspaceRect.top
          && rect.top <= workspaceRect.bottom
          && style.visibility !== "hidden"
          && !element.closest("#diana-zcode-chrome"))
        .slice(0, 40)
        .map(({ element, rect, style }) => ({
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          leftOffset: Math.round(rect.left - workspaceRect.left),
          topOffset: Math.round(rect.top - workspaceRect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          position: style.position,
          zIndex: style.zIndex,
          opacity: style.opacity,
          pointerEvents: style.pointerEvents,
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage === "none" ? "none" : "present",
          borderLeft: style.borderLeft,
          boxShadow: style.boxShadow
        }));
      const pseudoElements = [...document.querySelectorAll("*")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const before = getComputedStyle(element, "::before");
          const after = getComputedStyle(element, "::after");
          return { element, rect, before, after };
        })
        .filter(({ element, rect, before, after }) => rect.left <= workspaceRect.left + 100
          && rect.right >= workspaceRect.left
          && rect.bottom >= workspaceRect.top
          && rect.top <= workspaceRect.bottom
          && !element.closest("#diana-zcode-chrome")
          && ([before.content, after.content].some((value) => !["none", "normal"].includes(value))
            || [before.backgroundImage, after.backgroundImage].some((value) => value !== "none")))
        .slice(0, 40)
        .map(({ element, rect, before, after }) => ({
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          leftOffset: Math.round(rect.left - workspaceRect.left),
          topOffset: Math.round(rect.top - workspaceRect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          before: {
            content: before.content,
            position: before.position,
            left: before.left,
            top: before.top,
            width: before.width,
            height: before.height,
            backgroundColor: before.backgroundColor,
            backgroundImage: before.backgroundImage === "none" ? "none" : "present",
            borderTop: before.borderTop
          },
          after: {
            content: after.content,
            position: after.position,
            left: after.left,
            top: after.top,
            width: after.width,
            height: after.height,
            backgroundColor: after.backgroundColor,
            backgroundImage: after.backgroundImage === "none" ? "none" : "present",
            borderTop: after.borderTop
          }
        }));
      return {
        found: false,
        candidateCount: candidates.length,
        edgeElementCount: edgeElements.length,
        edgeElements,
        maskElementCount: maskElements.length,
        maskElements,
        tallEdgeElementCount: tallEdgeElements.length,
        tallEdgeElements,
        pseudoElementCount: pseudoElements.length,
        pseudoElements
      };
    }
    const sampleIndices = [...new Set([0, 1, Math.floor(match.buttons.length / 2), match.buttons.length - 2, match.buttons.length - 1])]
      .filter((index) => index >= 0 && index < match.buttons.length);
    const samples = sampleIndices.map((index) => {
      const button = match.buttons[index];
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return {
        index,
        className: typeof button.className === "string" ? button.className : "",
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        ariaCurrent: button.getAttribute("aria-current"),
        dataState: button.getAttribute("data-state"),
        dataActive: button.getAttribute("data-active"),
        dataVisualTone: button.getAttribute("data-visual-tone"),
        dataDianaMajor: button.getAttribute("data-diana-rail-major"),
        dataDianaCurrent: button.getAttribute("data-diana-viewport-current"),
        inlineScale: button.style.getPropertyValue("--diana-art-scale"),
        backgroundColor: style.backgroundColor,
        opacity: style.opacity,
        descendants: [...button.querySelectorAll("*")].slice(0, 5).map((child) => {
          const childRect = child.getBoundingClientRect();
          const childStyle = getComputedStyle(child);
          return {
            tag: child.tagName.toLowerCase(),
            className: typeof child.className === "string" ? child.className : "",
            directChild: child.parentElement === button,
            matchesRailLine: child.matches("html.diana-zcode-host .diana-zcode-message-rail button > span"),
            width: Math.round(childRect.width),
            height: Math.round(childRect.height),
            backgroundColor: childStyle.backgroundColor,
            backgroundImage: childStyle.backgroundImage === "none" ? "none" : "present",
            opacity: childStyle.opacity,
            transform: childStyle.transform
          };
        })
      };
    });
    const runtimeStyle = document.getElementById("diana-zcode-runtime-style");
    const railRules = runtimeStyle?.sheet
      ? [...runtimeStyle.sheet.cssRules]
        .filter((rule) => (rule.selectorText || "").includes("diana-zcode-message-rail"))
        .map((rule) => ({ selector: rule.selectorText, cssText: rule.cssText }))
      : [];
    return {
      found: true,
      tag: match.element.tagName.toLowerCase(),
      className: typeof match.element.className === "string" ? match.element.className : "",
      insideRoot: Boolean(document.getElementById("root")?.contains(match.element)),
      attributeNames: match.element.getAttributeNames().filter((name) => name === "role" || name.startsWith("aria-") || name.startsWith("data-")),
      width: Math.round(match.rect.width),
      height: Math.round(match.rect.height),
      buttonCount: match.buttons.length,
      markedCurrentCount: match.buttons.filter((button) => button.matches("[aria-current='true'], [aria-current='page'], [data-state='active'], [data-active='true']")).length,
      dianaCurrentCount: match.buttons.filter((button) => button.dataset.dianaViewportCurrent === "true").length,
      railProfile: match.element.dataset.dianaRailProfile || null,
      runtimeStyleHasRail: Boolean(runtimeStyle?.textContent.includes("diana-zcode-message-rail")),
      railRuleCount: railRules.length,
      railRules,
      samples
    };
  })()`);
  console.log(JSON.stringify(result, null, 2));
}

async function probeRailInteraction() {
  const session = readSession();
  if (!session?.port) throw new Error("NO_ACTIVE_SESSION");
  verifyListener(session.port);
  const target = await waitForRendererTarget(session.port, 8_000);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  const runtimeValue = async (expression) => {
    const result = await client.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false
    }, 30_000);
    if (result.exceptionDetails) throw new Error("RUNTIME_EVALUATION_FAILED");
    return result.result?.value;
  };
  const snapshotExpression = (index) => `(() => {
    const rail = document.querySelector(".diana-zcode-message-rail");
    const buttons = rail ? [...rail.querySelectorAll("button")] : [];
    const center = ${index};
    const items = [-2, -1, 0, 1, 2].map((offset) => {
      const button = buttons[center + offset];
      const line = button?.querySelector(":scope > span");
      const rect = line?.getBoundingClientRect();
      return {
        offset,
        tone: button?.getAttribute("data-visual-tone") || null,
        width: rect?.width || 0,
        color: line ? getComputedStyle(line).backgroundColor : null
      };
    });
    return {
      found: Boolean(rail && buttons[center]),
      currentCount: buttons.filter((button) => button.dataset.dianaViewportCurrent === "true").length,
      nativeCurrentCount: buttons.filter((button) => button.dataset.active === "true" || button.getAttribute("aria-current") === "location").length,
      items
    };
  })()`;
  try {
    await client.connect();
    await client.call("Runtime.enable");
    const targetInfo = await runtimeValue(`(() => {
      const rail = document.querySelector(".diana-zcode-message-rail");
      const buttons = rail ? [...rail.querySelectorAll("button")] : [];
      const visible = buttons.map((button, index) => ({ button, index, rect: button.getBoundingClientRect() }))
        .filter(({ index, rect }) => index >= 2
          && index <= buttons.length - 3
          && rect.top >= 0
          && rect.bottom <= window.innerHeight
          && rect.width > 0);
      const target = visible[Math.floor(visible.length / 2)] || null;
      return target ? {
        found: true,
        index: target.index,
        x: target.rect.left + target.rect.width / 2,
        y: target.rect.top + target.rect.height / 2,
        releaseX: Math.max(1, window.innerWidth - 2),
        releaseY: 2
      } : { found: false };
    })()`);
    if (!targetInfo?.found) throw new Error("RAIL_HOVER_TARGET_NOT_FOUND");
    const before = await runtimeValue(snapshotExpression(targetInfo.index));
    await client.call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: targetInfo.x,
      y: targetInfo.y,
      button: "none"
    });
    await new Promise((resolve) => setTimeout(resolve, 220));
    const hovered = await runtimeValue(snapshotExpression(targetInfo.index));
    await client.call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: targetInfo.releaseX,
      y: targetInfo.releaseY,
      button: "none"
    });
    await new Promise((resolve) => setTimeout(resolve, 220));
    const released = await runtimeValue(snapshotExpression(targetInfo.index));
    const expectedTones = ["mid", "near", "peak", "near", "mid"];
    const hoverPassed = hovered.items.every((item, itemIndex) => (
      item.tone === expectedTones[itemIndex] && item.width > before.items[itemIndex].width
    ));
    const releasedPassed = released.items.every((item, itemIndex) => (
      item.tone === "idle" && Math.abs(item.width - before.items[itemIndex].width) <= 1
    ));
    console.log(JSON.stringify({
      status: hoverPassed && releasedPassed ? "ok" : "failed",
      targetIndex: targetInfo.index,
      before,
      hovered,
      released,
      hoverPassed,
      releasedPassed
    }, null, 2));
    if (!hoverPassed || !releasedPassed) throw new Error("RAIL_INTERACTION_VERIFY_FAILED");
  } finally {
    client.close();
  }
}

async function probeSidebar() {
  const session = readSession();
  if (!session?.port) throw new Error("NO_ACTIVE_SESSION");
  verifyListener(session.port);
  const target = await waitForRendererTarget(session.port, 8_000);
  const result = await evaluate(target, `(() => {
    const workspace = document.querySelector("[data-diana-zcode-workspace='true']");
    if (!workspace) return { found: false, reason: "workspace_missing" };
    const workspaceRect = workspace.getBoundingClientRect();
    const candidates = [...document.querySelectorAll("aside, nav, section, div")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const controls = [...element.querySelectorAll("button, a, [role='button']")]
          .filter((control) => {
            const controlRect = control.getBoundingClientRect();
            return controlRect.width >= 100 && controlRect.height >= 20 && controlRect.height <= 56;
          });
        return { element, rect, style, controls };
      })
      .filter(({ rect }) => rect.left >= -2
        && rect.left <= 4
        && Math.abs(rect.right - workspaceRect.left) <= 8
        && rect.width >= 180
        && rect.width <= 360
        && rect.height >= window.innerHeight * .65)
      .sort((left, right) => right.controls.length - left.controls.length
        || right.rect.height - left.rect.height
        || left.element.childElementCount - right.element.childElementCount);
    const match = candidates[0];
    if (!match) return {
      found: false,
      reason: "sidebar_not_found",
      workspaceLeft: Math.round(workspaceRect.left),
      candidateCount: candidates.length
    };
    const attributes = (element) => Object.fromEntries(element.getAttributeNames()
      .filter((name) => name === "role" || name.startsWith("aria-") || name.startsWith("data-"))
      .map((name) => [name, element.getAttribute(name)]));
    const rows = match.controls.slice(0, 80).map((control, index) => {
      const rect = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      return {
        index,
        tag: control.tagName.toLowerCase(),
        text: (control.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 48),
        className: typeof control.className === "string" ? control.className : "",
        attributes: attributes(control),
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        style: {
          color: style.color,
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          borderRadius: style.borderRadius,
          opacity: style.opacity
        }
      };
    });
    const scrollRegions = [...match.element.querySelectorAll("*")]
      .map((element) => ({ element, rect: element.getBoundingClientRect(), style: getComputedStyle(element) }))
      .filter(({ rect, style }) => rect.width >= 150
        && rect.height >= 120
        && ["auto", "scroll"].includes(style.overflowY))
      .slice(0, 12)
      .map(({ element, rect, style }) => ({
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === "string" ? element.className : "",
        attributes: attributes(element),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        overflowY: style.overflowY,
        scrollbarColor: style.scrollbarColor
      }));
    const visualRows = [...match.element.querySelectorAll("button, a, div")]
      .map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
        style: getComputedStyle(element),
        attributes: attributes(element)
      }))
      .filter(({ rect, style, attributes }) => rect.left >= match.rect.left
        && rect.right <= match.rect.right + 1
        && rect.width >= 20
        && rect.height >= 22
        && rect.height <= 44
        && style.display !== "none")
      .slice(0, 100)
      .map(({ element, rect, style, attributes }) => ({
        tag: element.tagName.toLowerCase(),
        text: (element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 64),
        className: typeof element.className === "string" ? element.className : "",
        attributes,
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius
      }));
    const sidebarAfter = getComputedStyle(match.element, "::after");
    const activeTab = match.element.querySelector('[role="tab"][data-slot="tabs-trigger"][aria-selected="true"]');
    const selectedTask = match.element.querySelector('[data-testid^="task-item-"].bg-selected');
    const selectedTaskBefore = selectedTask ? getComputedStyle(selectedTask, "::before") : null;
    return {
      found: true,
      workspaceLeft: Math.round(workspaceRect.left),
      sidebar: {
        tag: match.element.tagName.toLowerCase(),
        className: typeof match.element.className === "string" ? match.element.className : "",
        attributes: attributes(match.element),
        width: Math.round(match.rect.width),
        height: Math.round(match.rect.height),
        backgroundColor: match.style.backgroundColor,
        borderRight: match.style.borderRight,
        position: match.style.position,
        zIndex: match.style.zIndex,
        controlCount: match.controls.length,
        edgeAccent: {
          content: sidebarAfter.content,
          width: sidebarAfter.width,
          backgroundImage: sidebarAfter.backgroundImage === "none" ? "none" : "present"
        },
        activeTab: activeTab ? {
          text: (activeTab.textContent || "").replace(/\\s+/g, " ").trim(),
          backgroundImage: getComputedStyle(activeTab).backgroundImage === "none" ? "none" : "present",
          boxShadow: getComputedStyle(activeTab).boxShadow
        } : null,
        selectedTask: selectedTask ? {
          text: (selectedTask.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 64),
          backgroundImage: getComputedStyle(selectedTask).backgroundImage === "none" ? "none" : "present",
          markerContent: selectedTaskBefore.content,
          markerWidth: selectedTaskBefore.width,
          markerHeight: selectedTaskBefore.height
        } : null
      },
      rows,
      scrollRegions,
      visualRows
    };
  })()`);
  const safeResult = result?.found ? {
    found: true,
    workspaceLeft: result.workspaceLeft,
    sidebar: {
      ...result.sidebar,
      selectedTask: result.sidebar.selectedTask ? {
        backgroundImage: result.sidebar.selectedTask.backgroundImage,
        markerContent: result.sidebar.selectedTask.markerContent,
        markerWidth: result.sidebar.selectedTask.markerWidth,
        markerHeight: result.sidebar.selectedTask.markerHeight
      } : null
    },
    scrollRegions: result.scrollRegions.map((region) => ({
      width: region.width,
      height: region.height,
      overflowY: region.overflowY,
      scrollbarColor: region.scrollbarColor
    }))
  } : result;
  console.log(JSON.stringify(safeResult, null, 2));
}

function status() {
  const session = readSession();
  const machine = inspectMachine();
  machine.processes = Array.isArray(machine.processes)
    ? machine.processes
    : machine.processes
      ? [machine.processes]
      : [];
  let listenerActive = false;
  let listenerCode = null;
  if (session?.port) {
    try {
      verifyListener(session.port);
      listenerActive = true;
    } catch (error) {
      listenerCode = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    }
  }
  const recordedStatus = session?.status || null;
  const effectiveStatus = !listenerActive && ["launching", "mounted"].includes(recordedStatus)
    ? "inactive"
    : recordedStatus;
  const output = {
    session: session ? {
      status: effectiveStatus,
      recordedStatus,
      listenerActive,
      listenerCode,
      version: session.version,
      pid: session.pid,
      address: session.address,
      port: session.port,
      theme: session.theme,
      updatedAt: session.updatedAt
    } : null,
    runningOfficialZCodePids: machine.processes.map((process) => process.pid),
    currentVersion: machine.fileVersion,
    signature: machine.signature
  };
  console.log(JSON.stringify(output, null, 2));
}

async function main() {
  const command = process.argv[2] || "status";
  const themeIndex = process.argv.indexOf("--theme");
  const requestedTheme = themeIndex >= 0 ? process.argv[themeIndex + 1] : "auto";
  if (!["auto", "dark", "light"].includes(requestedTheme)) throw new Error("INVALID_THEME");

  if (command === "start") await startTheme(requestedTheme);
  else if (command === "apply") await applyTheme(requestedTheme);
  else if (command === "disable") await disableTheme();
  else if (command === "verify") await verifyTheme();
  else if (command === "probe-layout") await probeLayout();
  else if (command === "probe-rail") await probeRail();
  else if (command === "probe-rail-interaction") await probeRailInteraction();
  else if (command === "probe-sidebar") await probeSidebar();
  else if (command === "status") status();
  else if (command === "preflight") preflight();
  else throw new Error("UNKNOWN_COMMAND");
}

main().catch((error) => {
  const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  writeEvent("adapter_failed", { status: "error", code });
  console.error(JSON.stringify({ status: "error", code }, null, 2));
  process.exitCode = 1;
});
