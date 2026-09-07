import fs from "node:fs";
import { options, checkPrerequisites, verifyBundle, trustedSocket } from "./delivery-runtime.mjs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ADAPTER_VERSION = "reviewed-grok-bot-0.28.0-v3";
const CONFIG = options(ROOT, "Grok Bot.exe");
const GROK_EXE = CONFIG.executable;
const EXPECTED_FILE_VERSION = "0.28.0";
const EXPECTED_PRODUCT_VERSION = "0.28.0.0";
const EXPECTED_SIGNER = "A7B4A9C2C6D639E310E7579AEE16B7390B0F6269";
const SESSION_PATH = path.join(ROOT, "state", "session.json");
const RESTORE_PATH = path.join(ROOT, "state", "restore-record.json");
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

function readJson(target) {
  return JSON.parse(fs.readFileSync(target, "utf8").replace(/^\uFEFF/, ""));
}

function writeJsonAtomic(target, value) {
  ensureDirectory(path.dirname(target));
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    fs.renameSync(temporary, target);
  } catch (error) {
    if (!["EXDEV", "EEXIST", "EPERM"].includes(error.code)) throw error;
    fs.copyFileSync(temporary, target);
    fs.unlinkSync(temporary);
  }
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
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false); ${script}`
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, PSModulePath: WINDOWS_POWERSHELL_MODULE_PATH, ...extraEnv },
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
    "$item=Get-Item -LiteralPath $env:DIANA_GROK_EXE -ErrorAction Stop; " +
      "$sig=Get-AuthenticodeSignature -LiteralPath $env:DIANA_GROK_EXE; " +
      "[pscustomobject]@{fileVersion=$item.VersionInfo.FileVersion;productVersion=$item.VersionInfo.ProductVersion;productName=$item.VersionInfo.ProductName;signature=[string]$sig.Status;signerThumbprint=if($sig.SignerCertificate){$sig.SignerCertificate.Thumbprint}else{''}} | ConvertTo-Json -Compress",
    { DIANA_GROK_EXE: GROK_EXE }
  );
  const report = JSON.parse(output);
  if (
    report.fileVersion !== EXPECTED_FILE_VERSION ||
    report.productVersion !== EXPECTED_PRODUCT_VERSION ||
    report.productName !== "Grok Bot"
  ) {
    fail("VERSION_MISMATCH", `Grok Bot 版本不匹配；只允许 ${EXPECTED_FILE_VERSION}。`, {
      version: report.fileVersion
    });
  }
  if (
    report.signature !== "Valid" ||
    String(report.signerThumbprint).toUpperCase() !== EXPECTED_SIGNER
  ) {
    fail("SIGNATURE_MISMATCH", `Grok Bot 数字签名与已核验发布者不一致（status=${report.signature}; signer=${String(report.signerThumbprint).toUpperCase()}）。`, {
      version: report.fileVersion
    });
  }
  return report;
}

function grokProcesses() {
  const output = powershell(
    "$items=@(Get-CimInstance Win32_Process -Filter \"Name='Grok Bot.exe'\" -ErrorAction SilentlyContinue | ForEach-Object { " +
      "$cmd=[string]$_.CommandLine; $p=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; " +
      "[pscustomobject]@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;path=[string]$_.ExecutablePath;primary=(-not $cmd.Contains('--type='));hasLoopback=($cmd.Contains('--remote-debugging-address=127.0.0.1'));debugPort=if($cmd -match '--remote-debugging-port(?:=|\\s+)(\\d+)'){[int]$Matches[1]}else{$null};visible=([bool]($p -and $p.MainWindowHandle -ne 0))} }); $items | ConvertTo-Json -Compress"
  );
  if (!output) return [];
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function listenerOwner(port) {
  const output = powershell(
    "$items=@(Get-NetTCPConnection -State Listen -LocalPort ([int]$env:DIANA_GROK_PORT) -ErrorAction SilentlyContinue | ForEach-Object {[pscustomobject]@{pid=[int]$_.OwningProcess;address=[string]$_.LocalAddress;port=[int]$_.LocalPort}}); $items | ConvertTo-Json -Compress",
    { DIANA_GROK_PORT: String(port) }
  );
  if (!output) return [];
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function normalizeFile(target) {
  return path.resolve(target).toLocaleLowerCase("en-US");
}

function validateManagedSession(port, quiet = false) {
  try {
    trustReport();
    const processes = grokProcesses();
    const expectedPath = normalizeFile(GROK_EXE);
    const main = processes.find(
      (item) =>
        item.primary &&
        item.hasLoopback &&
        item.debugPort === port &&
        item.path &&
        normalizeFile(item.path) === expectedPath
    );
    if (!main) {
      const error = new Error("没有找到属于本次 Diana 会话的可见 Grok Bot 主窗口。");
      error.code = "MANAGED_GROK_NOT_FOUND";
      throw error;
    }
    const owners = listenerOwner(port);
    if (owners.some(item => item.address !== "127.0.0.1")) fail("NON_LOOPBACK_LISTENER", "拒绝非回环监听。");
    const owner = owners.find((candidate) => candidate.address === "127.0.0.1");
    if (!owner) {
      const error = new Error("没有找到本次 127.0.0.1 调试监听。");
      error.code = "LISTENER_NOT_FOUND";
      throw error;
    }
    const ownerProcess = processes.find((item) => item.pid === owner.pid);
    if (!ownerProcess || owner.pid !== main.pid || !ownerProcess.path || normalizeFile(ownerProcess.path) !== expectedPath) {
      const error = new Error("调试端口所有者不是已核验的 Grok Bot 可执行文件。");
      error.code = "LISTENER_OWNER_MISMATCH";
      throw error;
    }
    return { processes, main, owner };
  } catch (error) {
    if (!quiet) fail(error.code ?? "SESSION_VALIDATION_FAILED", error.message, { port });
    throw error;
  }
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

function modeValue(value) {
  const mode = String(value ?? "dark").toLowerCase();
  if (!["dark", "light", "system"].includes(mode)) {
    fail("INVALID_MODE", "主题模式只能是 dark、light 或 system。");
  }
  return mode;
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
  if (/__[A-Z0-9_]+__/.test(css)) {
    fail("CSS_PLACEHOLDER_REMAINS", "主题 CSS 仍包含未解析素材占位符。");
  }
  if (/https?:\/\//i.test(css)) fail("REMOTE_ASSET_REJECTED", "主题 CSS 不能引用远程资源。");
  if (!css.includes("html.diana-grok-host")) fail("UNSCOPED_CSS", "主题 CSS 缺少 Diana 主机作用域。");
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
      }, 10000);
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
    )
      .split("\n", 1)[0]
      .slice(0, 240);
    throw new Error("RENDERER_EVALUATION_FAILED: 未记录页面异常正文。");
  }
  return result.result?.value;
}

async function listTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(1500)
  });
  if (!response.ok) return [];
  const targets = await response.json();
  return Array.isArray(targets) ? targets : [];
}

function capabilityExpression() {
  return `(() => {
    const localUrl = /^(file:|app:|vscode-file:)/.test(location.protocol);
    const bridge = window.desktop?.theme;
    return {
      ready: document.readyState === 'interactive' || document.readyState === 'complete',
      visible: document.visibilityState === 'visible',
      localUrl,
      documentPresent: !!(document.documentElement && document.head && document.body),
      themeGet: typeof bridge?.get === 'function',
      themeSet: typeof bridge?.set === 'function',
      width: innerWidth,
      height: innerHeight
    };
  })()`;
}

async function findAppTarget(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await listTargets(port);
      for (const target of targets) {
        if (target.type !== "page" || !target.webSocketDebuggerUrl) continue;
        if (!trustedSocket(target.webSocketDebuggerUrl, port)) continue;
        if (!/^(file:|app:|vscode-file:)/.test(String(target.url ?? ""))) continue;
        let client;
        try {
          client = await CdpClient.connect(target.webSocketDebuggerUrl);
          const probe = await evaluate(client, capabilityExpression());
          if (
            probe?.ready &&
            probe.localUrl &&
            probe.documentPresent &&
            probe.themeGet &&
            probe.themeSet &&
            probe.width >= 700 &&
            probe.height >= 500
          ) {
            return { client, probe };
          }
        } catch {
          // Probe another local renderer without logging its URL or contents.
        }
        client?.close();
      }
    } catch {
      // The signed app may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  fail("EXPECTED_RENDERER_NOT_FOUND", "未找到可见且具有原生主题桥的 Grok Bot 渲染页。", { port });
}

function appearanceExpression() {
  return `(async () => {
    const bridge = window.desktop?.theme;
    if (typeof bridge?.get !== 'function') return { ok: false };
    const raw = await bridge.get();
    const value = typeof raw === 'string' ? raw : null;
    const preference = value || raw?.preference || raw?.theme || raw?.mode || 'system';
    const resolved = raw?.resolved || raw?.resolvedTheme || raw?.effective || null;
    const accent = raw?.accent || raw?.accentColor || null;
    return {
      ok: true,
      preference: ['dark','light','system'].includes(preference) ? preference : 'system',
      resolved: ['dark','light'].includes(resolved) ? resolved : null,
      accent: ['black','blue'].includes(accent) ? accent : null
    };
  })()`;
}

function setAppearanceExpression(mode, accent = null) {
  return `(async () => {
    const bridge = window.desktop?.theme;
    if (typeof bridge?.set !== 'function') return { ok: false };
    await bridge.set(${JSON.stringify(mode)});
    if (${JSON.stringify(Boolean(accent))} && typeof bridge?.setAccent === 'function') {
      await bridge.setAccent(${JSON.stringify(accent)});
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
    const raw = typeof bridge?.get === 'function' ? await bridge.get() : null;
    const value = typeof raw === 'string' ? raw : null;
    const preference = value || raw?.preference || raw?.theme || raw?.mode || ${JSON.stringify(mode)};
    const resolved = raw?.resolved || raw?.resolvedTheme || raw?.effective || null;
    const resultAccent = raw?.accent || raw?.accentColor || null;
    return { ok: true, preference, resolved, accent: resultAccent };
  })()`;
}

function injectionExpression(css, mode) {
  return `(() => {
    if (window.__dianaGrokRuntime?.dispose) window.__dianaGrokRuntime.dispose();
    document.querySelectorAll('#diana-grok-theme-chrome,#diana-grok-theme-underlay,#diana-grok-theme-style').forEach((node) => node.remove());
    const root = document.documentElement;
    root.classList.add('diana-grok-host');
    const requestedMode = ${JSON.stringify(mode)};
    const media = matchMedia('(prefers-color-scheme: dark)');
    const syncMode = () => { root.dataset.dianaGrokMode = requestedMode === 'system' ? (media.matches ? 'dark' : 'light') : requestedMode; };
    syncMode();
    media.addEventListener('change', syncMode);

    const style = document.createElement('style');
    style.id = 'diana-grok-theme-style';
    style.textContent = ${JSON.stringify(css)};
    document.head.appendChild(style);

    const chrome = document.createElement('div');
    chrome.id = 'diana-grok-theme-chrome';
    chrome.setAttribute('aria-hidden', 'true');
    const underlay = document.createElement('div');
    underlay.id = 'diana-grok-theme-underlay';
    underlay.setAttribute('aria-hidden', 'true');
    const blackHole = document.createElement('span');
    blackHole.className = 'diana-grok-black-hole';
    underlay.appendChild(blackHole);
    const workarea = document.createElement('div');
    workarea.className = 'diana-grok-workarea';
    for (const className of [
      'diana-grok-corner',
      'diana-grok-upper',
      'diana-grok-character',
      'diana-grok-ornaments',
      'diana-grok-acao',
      'diana-grok-doodle'
    ]) {
      const layer = document.createElement('span');
      layer.className = className;
      workarea.appendChild(layer);
    }
    chrome.appendChild(workarea);
    document.body.appendChild(chrome);

    const visibleRect = (element) => {
      if (!(element instanceof HTMLElement)) return null;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return null;
      const box = element.getBoundingClientRect();
      if (box.width < 4 || box.height < 4) return null;
      return box;
    };
    const scoreSurface = (element) => {
      if (element === chrome || element === underlay || chrome.contains(element) || underlay.contains(element)) return null;
      const box = visibleRect(element);
      if (!box) return null;
      if (box.width < innerWidth * 0.5 || box.height < innerHeight * 0.55) return null;
      const leftReward = box.left >= Math.min(360, innerWidth * 0.15) ? innerWidth * innerHeight : 0;
      const topPenalty = box.top > innerHeight * 0.25 ? innerWidth * innerHeight : 0;
      return { element, box, score: box.width * box.height + leftReward - topPenalty };
    };
    const findSurface = () => {
      const semantic = [...document.querySelectorAll('main,[role="main"]')]
        .map(scoreSurface)
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)[0];
      if (semantic) return semantic.element;
      return [...document.body.children]
        .map(scoreSurface)
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)[0]?.element || document.body;
    };
    const findComposer = () => [...document.querySelectorAll('textarea,[contenteditable="true"],form')]
      .map((element) => ({ element, box: visibleRect(element) }))
      .filter((item) => item.box && item.box.top > innerHeight * 0.55 && item.box.width > 180)
      .sort((a, b) => b.box.top - a.box.top)[0] || null;
    const findSidebar = () => [...document.querySelectorAll('aside,nav,[role="navigation"]')]
      .map((element) => ({ element, box: visibleRect(element) }))
      .filter((item) => item.box && item.box.left < 60 && item.box.width < innerWidth * 0.42 && item.box.height > innerHeight * 0.45)
      .sort((a, b) => b.box.height - a.box.height)[0] || null;

    let surface = null;
    let frame = 0;
    const update = () => {
      frame = 0;
      surface = findSurface();
      const box = visibleRect(surface) || { left: 0, top: 36, width: innerWidth, height: innerHeight - 36 };
      if (surface && (underlay.parentElement !== surface || surface.firstElementChild !== underlay)) {
        surface.insertBefore(underlay, surface.firstChild);
      }
      const left = Math.max(0, box.left);
      const top = Math.max(32, box.top);
      const right = Math.min(innerWidth, box.right ?? (box.left + box.width));
      const bottom = Math.min(innerHeight, box.bottom ?? (box.top + box.height));
      workarea.style.setProperty('--diana-left', left + 'px');
      workarea.style.setProperty('--diana-top', top + 'px');
      workarea.style.setProperty('--diana-width', Math.max(0, right - left) + 'px');
      workarea.style.setProperty('--diana-height', Math.max(0, bottom - top) + 'px');
      workarea.dataset.surfaceTag = surface?.tagName?.toLowerCase() || 'body';
      underlay.dataset.surfaceTag = surface?.tagName?.toLowerCase() || 'body';
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };
    update();
    const resize = new ResizeObserver(schedule);
    resize.observe(document.documentElement);
    if (surface && surface !== document.body) resize.observe(surface);
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule, { passive: true });

    window.__dianaGrokRuntime = {
      version: ${JSON.stringify(ADAPTER_VERSION)},
      mode: ${JSON.stringify(mode)},
      dispose() {
        media.removeEventListener("change", syncMode);
        resize.disconnect();
        mutations.disconnect();
        if (frame) cancelAnimationFrame(frame);
        window.removeEventListener('resize', schedule);
        underlay.remove();
        chrome.remove();
        style.remove();
        root.classList.remove('diana-grok-host');
        delete root.dataset.dianaGrokMode;
        delete window.__dianaGrokRuntime;
      }
    };

    const box = workarea.getBoundingClientRect();
    const composer = findComposer();
    const sidebar = findSidebar();
    const character = getComputedStyle(workarea.querySelector('.diana-grok-character')).backgroundImage;
    const pointerEvents = getComputedStyle(chrome).pointerEvents;
    const underlayPointerEvents = getComputedStyle(underlay).pointerEvents;
    return {
      ok: true,
      host: root.classList.contains('diana-grok-host'),
      chromeCount: document.querySelectorAll('#diana-grok-theme-chrome').length,
      underlayCount: document.querySelectorAll('#diana-grok-theme-underlay').length,
      styleCount: document.querySelectorAll('#diana-grok-theme-style').length,
      pointerEvents,
      underlayPointerEvents,
      characterLoaded: character.includes('data:image/png'),
      surfaceTag: workarea.dataset.surfaceTag,
      surfaceWidth: Math.round(box.width),
      surfaceHeight: Math.round(box.height),
      composerPresent: Boolean(composer),
      composerTop: composer ? Math.round(composer.box.top) : null,
      sidebarPresent: Boolean(sidebar),
      sidebarWidth: sidebar ? Math.round(sidebar.box.width) : null,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      rendererVisible: document.visibilityState === 'visible'
    };
  })()`;
}

function statusExpression() {
  return `(() => {
    const root = document.documentElement;
    const chrome = document.querySelector('#diana-grok-theme-chrome');
    const underlay = document.querySelector('#diana-grok-theme-underlay');
    const workarea = chrome?.querySelector('.diana-grok-workarea');
    const box = workarea?.getBoundingClientRect();
    return {
      adapterVersion: window.__dianaGrokRuntime?.version ?? null,
      mode: window.__dianaGrokRuntime?.mode ?? root.dataset.dianaGrokMode ?? null,
      host: root.classList.contains('diana-grok-host'),
      chromeCount: document.querySelectorAll('#diana-grok-theme-chrome').length,
      underlayCount: document.querySelectorAll('#diana-grok-theme-underlay').length,
      styleCount: document.querySelectorAll('#diana-grok-theme-style').length,
      pointerEvents: chrome ? getComputedStyle(chrome).pointerEvents : null,
      underlayPointerEvents: underlay ? getComputedStyle(underlay).pointerEvents : null,
      surfaceWidth: box ? Math.round(box.width) : null,
      surfaceHeight: box ? Math.round(box.height) : null,
      rendererVisible: document.visibilityState === 'visible'
    };
  })()`;
}

function disableExpression() {
  return `(() => {
    if (window.__dianaGrokRuntime?.dispose) window.__dianaGrokRuntime.dispose();
    document.querySelectorAll('#diana-grok-theme-chrome,#diana-grok-theme-underlay,#diana-grok-theme-style').forEach((node) => node.remove());
    document.documentElement.classList.remove('diana-grok-host');
    delete document.documentElement.dataset.dianaGrokMode;
    return {
      host: document.documentElement.classList.contains('diana-grok-host'),
      chromeCount: document.querySelectorAll('#diana-grok-theme-chrome').length,
      underlayCount: document.querySelectorAll('#diana-grok-theme-underlay').length,
      styleCount: document.querySelectorAll('#diana-grok-theme-style').length
    };
  })()`;
}

async function connectManagedSession(session, quiet = false) {
  if (session.adapterVersion !== ADAPTER_VERSION || session.version !== EXPECTED_FILE_VERSION) fail("SESSION_MISMATCH", "会话版本与本次适配器不一致。");
  const validated = validateManagedSession(session.port, quiet);
  if (validated.main.pid !== session.pid) fail("SESSION_PID_MISMATCH", "调试进程不属于记录中的会话。");
  const target = await findAppTarget(session.port, 10000);
  return { ...validated, ...target };
}

async function captureAppearance(client) {
  const appearance = await evaluate(client, appearanceExpression());
  if (!appearance?.ok) fail("THEME_BRIDGE_MISSING", "Grok Bot 原生主题桥不可用。");
  if (!fs.existsSync(RESTORE_PATH) || readJson(RESTORE_PATH).restoredAt) {
    writeJsonAtomic(RESTORE_PATH, {
      schema: 1,
      adapterVersion: ADAPTER_VERSION,
      appVersion: EXPECTED_FILE_VERSION,
      originalPreference: appearance.preference,
      originalAccent: appearance.accent,
      capturedAt: new Date().toISOString()
    });
  }
  return appearance;
}

async function mountExisting(session, requestedMode) {
  const mode = modeValue(requestedMode);
  const connection = await connectManagedSession(session);
  let appearance;
  let mounted;
  try {
    await captureAppearance(connection.client);
    appearance = await evaluate(connection.client, setAppearanceExpression(mode));
    mounted = await evaluate(connection.client, injectionExpression(buildThemeCss(), mode));
  } finally {
    connection.client.close();
  }
  if (
    !appearance?.ok ||
    !mounted?.ok ||
    !mounted.host ||
    mounted.chromeCount !== 1 ||
    mounted.underlayCount !== 1 ||
    mounted.styleCount !== 1 ||
    mounted.pointerEvents !== "none" ||
    mounted.underlayPointerEvents !== "none" ||
    !mounted.characterLoaded ||
    mounted.surfaceWidth < 400 ||
    mounted.surfaceHeight < 300 ||
    mounted.viewportWidth < 700 ||
    mounted.viewportHeight < 500
  ) {
    fail("MOUNT_VERIFICATION_FAILED", "Grok Bot 视觉层写入后未通过结构复核。", {
      pid: connection.main.pid,
      port: session.port
    });
  }
  const updated = {
    schema: 1,
    adapterVersion: ADAPTER_VERSION,
    status: "mounted",
    version: EXPECTED_FILE_VERSION,
    pid: connection.main.pid,
    listenerPid: connection.owner.pid,
    port: session.port,
    mode,
    startedAt: session.startedAt,
    mountedAt: new Date().toISOString(),
    viewport: { width: mounted.viewportWidth, height: mounted.viewportHeight },
    surface: { width: mounted.surfaceWidth, height: mounted.surfaceHeight },
    nativePreference: appearance.preference,
    nativeResolved: appearance.resolved
  };
  writeJsonAtomic(SESSION_PATH, updated);
  appendEvent("mounted", {
    status: "mounted",
    version: EXPECTED_FILE_VERSION,
    pid: updated.pid,
    port: updated.port,
    note: mode
  });
  return updated;
}

async function start(requestedMode) {
  const mode = modeValue(requestedMode);
  const trust = trustReport();
  if (grokProcesses().length > 0) {
    fail("GROK_ALREADY_RUNNING", "普通 Grok Bot 仍在运行；为避免单实例忽略调试参数，本次没有启动。", {
      version: trust.fileVersion
    });
  }
  buildThemeCss(); // refuse missing artwork before opening a debugging port
  const port = await chooseLoopbackPort();
  if (!Number.isInteger(port) || port < 1024) fail("PORT_SELECTION_FAILED", "无法选择随机高位端口。");
  const child = spawn(
    GROK_EXE,
    ["--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${port}`],
    { detached: true, stdio: "ignore", windowsHide: false }
  );
  await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  child.unref();
  appendEvent("grok_started", {
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
  const deadline = Date.now() + 35000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      validateManagedSession(port, true);
      ready = true;
      break;
    } catch (error) {
      if (!["MANAGED_GROK_NOT_FOUND", "LISTENER_NOT_FOUND"].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  if (!ready) fail("GROK_START_TIMEOUT", "Grok Bot 启动后未形成受控可见窗口。", { port });
  return mountExisting(session, mode);
}

async function apply(requestedMode) {
  if (!fs.existsSync(SESSION_PATH)) fail("SESSION_MISSING", "没有可复用的 Grok Bot Diana 会话。");
  return mountExisting(readJson(SESSION_PATH), requestedMode);
}

async function status() {
  trustReport();
  if (!fs.existsSync(SESSION_PATH)) {
    return { status: "not_managed", running: grokProcesses().length > 0, version: EXPECTED_FILE_VERSION };
  }
  const session = readJson(SESSION_PATH);
  let connection;
  try {
    connection = await connectManagedSession(session, true);
    const result = await evaluate(connection.client, statusExpression());
    return {
      status: result?.host && result?.chromeCount === 1 && result?.underlayCount === 1 && result?.styleCount === 1 ? "mounted" : "managed_unmounted",
      running: true,
      version: EXPECTED_FILE_VERSION,
      pid: connection.main.pid,
      port: session.port,
      mode: result?.mode ?? session.mode,
      checks: result
    };
  } catch (error) {
    return {
      status: "not_managed",
      running: grokProcesses().length > 0,
      version: EXPECTED_FILE_VERSION,
      errorCode: error.code ?? "SESSION_STALE"
    };
  } finally {
    connection?.client?.close();
  }
}

async function disable() {
  if (!fs.existsSync(SESSION_PATH)) return { status: "not_managed", running: grokProcesses().length > 0 };
  const session = readJson(SESSION_PATH);
  const connection = await connectManagedSession(session);
  let result;
  try {
    result = await evaluate(connection.client, disableExpression());
  } finally {
    connection.client.close();
  }
  if (result?.host || result?.chromeCount !== 0 || result?.underlayCount !== 0 || result?.styleCount !== 0) {
    fail("DISABLE_VERIFICATION_FAILED", "Diana 视觉层移除后仍有残留。", {
      pid: connection.main.pid,
      port: session.port
    });
  }
  writeJsonAtomic(SESSION_PATH, { ...session, status: "disabled", disabledAt: new Date().toISOString() });
  appendEvent("disabled", {
    status: "disabled",
    version: EXPECTED_FILE_VERSION,
    pid: connection.main.pid,
    port: session.port
  });
  return { status: "disabled", running: true, pid: connection.main.pid, port: session.port };
}

async function restore() {
  if (!fs.existsSync(RESTORE_PATH)) return { status: "nothing_to_restore" };
  if (!fs.existsSync(SESSION_PATH)) return { status: "restore_record_present", running: grokProcesses().length > 0 };
  const session = readJson(SESSION_PATH);
  const restoreRecord = readJson(RESTORE_PATH);
  if (restoreRecord.restoredAt) return { status: "restored", running: grokProcesses().length > 0 };
  const connection = await connectManagedSession(session);
  let disabled;
  let appearance;
  try {
    disabled = await evaluate(connection.client, disableExpression());
    appearance = await evaluate(
      connection.client,
      setAppearanceExpression(restoreRecord.originalPreference ?? "system", restoreRecord.originalAccent ?? null)
    );
  } finally {
    connection.client.close();
  }
  if (disabled?.host || disabled?.chromeCount !== 0 || disabled?.underlayCount !== 0 || disabled?.styleCount !== 0 || !appearance?.ok) {
    fail("RESTORE_VERIFICATION_FAILED", "恢复 Grok Bot 原生外观时未通过复核。", {
      pid: connection.main.pid,
      port: session.port
    });
  }
  writeJsonAtomic(RESTORE_PATH, { ...restoreRecord, restoredAt: new Date().toISOString() });
  writeJsonAtomic(SESSION_PATH, { ...session, status: "restored", restoredAt: new Date().toISOString() });
  appendEvent("restored", {
    status: "restored",
    version: EXPECTED_FILE_VERSION,
    pid: connection.main.pid,
    port: session.port,
    note: restoreRecord.originalPreference ?? "system"
  });
  return {
    status: "restored",
    running: true,
    pid: connection.main.pid,
    port: session.port,
    nativePreference: appearance.preference
  };
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
  else if (action === "apply") result = await apply(mode);
  else if (action === "status") result = await status();
  else if (action === "disable") result = await disable();
  else result = await restore();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
export { injectionExpression, disableExpression, buildThemeCss, captureAppearance };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  process.stderr.write(`${error.code ?? "ADAPTER_FAILED"}: ${error.message}\n`);
  process.exitCode = 1;
});
