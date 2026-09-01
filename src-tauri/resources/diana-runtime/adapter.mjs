import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const LOG_PATH = path.join(ROOT, 'logs', 'events.jsonl');
const STYLE_ID = 'diana-machine-local-style';
const OVERLAY_ID = 'diana-theme-chrome';
const ADAPTER_KEY = '__dianaMachineLocalAdapter';
const SYSTEM_ROOT = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
const PROGRAM_FILES = process.env.ProgramFiles || 'C:\\Program Files';
const WINDOWS_POWERSHELL =
  process.env.DIANA_POWERSHELL_EXE ||
  path.join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const WINDOWS_POWERSHELL_MODULE_PATH = [
  path.join(PROGRAM_FILES, 'WindowsPowerShell', 'Modules'),
  path.join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'Modules'),
].join(';');

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseArgs(argv) {
  const command = argv[2] ?? 'self-test';
  const values = {};
  for (let i = 3; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) fail(`Unexpected argument: ${item}`);
    const key = item.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for --${key}`);
    values[key] = value;
    i += 1;
  }
  return { command, values };
}

function numeric(value, name) {
  if (!/^\d+$/.test(String(value ?? ''))) fail(`${name} must be an integer`);
  return Number(value);
}

function themeMode(value) {
  const mode = String(value ?? 'system').toLowerCase();
  if (!['dark', 'light', 'system'].includes(mode)) {
    fail('mode must be dark, light, or system');
  }
  return mode;
}

function appendEvent(event, details = {}) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  const safe = {
    time: new Date().toISOString(),
    event,
    adapterVersion: manifest.adapterVersion,
    compatibilityMode: manifest.compatibilityMode,
    codexVersion: details.codexVersion ?? null,
    ...details,
  };
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(safe)}\n`, 'utf8');
}

function powershellJson(script) {
  return execFileSync(
    WINDOWS_POWERSHELL,
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, PSModulePath: WINDOWS_POWERSHELL_MODULE_PATH },
    },
  ).trim();
}

function getPackage() {
  const script = [
    "$p=Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction Stop",
    "$main=Join-Path $p.InstallLocation 'app\\ChatGPT.exe'",
    "[pscustomobject]@{Version=$p.Version.ToString();Family=$p.PackageFamilyName;InstallLocation=$p.InstallLocation;Executable=$main}|ConvertTo-Json -Compress",
  ].join(';');
  const stdout = powershellJson(script);
  return JSON.parse(stdout);
}

function inspectRuntime(mainPid, port) {
  const script = [
    `$wantedPid=${mainPid}`,
    `$wantedPort=${port}`,
    "$p=Get-CimInstance Win32_Process -Filter \"ProcessId=$wantedPid\" -ErrorAction Stop",
    "$gp=Get-Process -Id $wantedPid -ErrorAction Stop",
    "$listeners=@(Get-NetTCPConnection -State Listen -LocalPort $wantedPort -ErrorAction Stop|Select-Object LocalAddress,LocalPort,OwningProcess)",
    "[pscustomobject]@{ProcessId=$p.ProcessId;ParentProcessId=$p.ParentProcessId;ExecutablePath=$p.ExecutablePath;CommandLine=$p.CommandLine;MainWindowHandle=$gp.MainWindowHandle.ToInt64();Listeners=$listeners}|ConvertTo-Json -Compress -Depth 5",
  ].join(';');
  const stdout = powershellJson(script);
  return JSON.parse(stdout);
}

function validateRuntime(mainPid, port) {
  const pkg = getPackage();
  if (pkg.Family !== manifest.packageFamily) fail('Unexpected Codex package family');

  const runtime = inspectRuntime(mainPid, port);
  const expectedPath = path.resolve(pkg.Executable).toLowerCase();
  const actualPath = path.resolve(runtime.ExecutablePath).toLowerCase();
  if (actualPath !== expectedPath) fail('Main process executable does not match the signed Codex package');
  if (!String(runtime.CommandLine).includes(`--remote-debugging-port=${port}`)) {
    fail('Main process does not own the expected debugging launch argument');
  }
  if (!String(runtime.CommandLine).includes('--remote-debugging-address=127.0.0.1')) {
    fail('Main process is not restricted to the planned loopback address');
  }
  if (!runtime.MainWindowHandle) fail('Expected visible Codex window was not found');

  const listeners = Array.isArray(runtime.Listeners) ? runtime.Listeners : [runtime.Listeners];
  if (!listeners.length) fail('No debugger listener was found');
  for (const listener of listeners) {
    if (!['127.0.0.1', '::1'].includes(listener.LocalAddress)) {
      fail(`Refusing non-loopback listener: ${listener.LocalAddress}`);
    }
  }
  return { pkg, runtime };
}

function requestJson(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: pathname, timeout: 3500 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Local debugger returned HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 2_000_000) req.destroy(new Error('Local debugger response exceeded limit'));
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Local debugger returned invalid JSON'));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Local debugger timed out')));
    req.on('error', reject);
  });
}

function evaluate(webSocketDebuggerUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketDebuggerUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('Renderer evaluation timed out'));
    }, 12000);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true },
      }));
    });
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (message.error) reject(new Error(`Renderer rejected evaluation: ${message.error.message}`));
      else if (message.result?.exceptionDetails) reject(new Error('Renderer expression raised an exception'));
      else resolve(message.result?.result?.value ?? null);
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('Renderer WebSocket failed'));
    });
  });
}

function dataUrl(file) {
  return `url("data:image/png;base64,${fs.readFileSync(file).toString('base64')}")`;
}

function scopedCss(file, modeClass) {
  const css = fs.readFileSync(file, 'utf8');
  if (!css.includes('html.diana-theme-host')) fail(`Theme CSS lacks host scope: ${file}`);
  return css.replaceAll('html.diana-theme-host', `html.diana-theme-host.${modeClass}`);
}

function buildPayload(requestedMode) {
  const assets = Object.fromEntries(
    Object.entries(manifest.assets).map(([name, relative]) => [name, dataUrl(path.join(ROOT, relative))]),
  );
  const darkCss = scopedCss(path.join(ROOT, manifest.themes.dark), 'diana-mode-dark');
  const lightCss = scopedCss(path.join(ROOT, manifest.themes.light), 'diana-mode-light');
  const bridgeCss = `
html.diana-theme-host .diana-skin-surface {
  isolation: isolate;
  overflow: hidden;
}
html.diana-theme-host .diana-skin-surface > #diana-theme-chrome {
  position: absolute !important;
  inset: 0 !important;
  width: auto !important;
  height: auto !important;
  z-index: 0 !important;
}
html.diana-theme-host #diana-theme-chrome {
  pointer-events: none !important;
}
html.diana-theme-host #diana-theme-chrome *,
html.diana-theme-host #diana-theme-chrome *::before,
html.diana-theme-host #diana-theme-chrome *::after {
  pointer-events: none !important;
}
`;
  return {
    adapterVersion: manifest.adapterVersion,
    styleId: STYLE_ID,
    requestedMode,
    darkCss,
    lightCss,
    bridgeCss,
    assets,
  };
}

function bootstrap(payload) {
  const KEY = '__dianaMachineLocalAdapter';
  const doc = document;
  if (window[KEY]?.disable) window[KEY].disable();

  const state = {
    version: payload.adapterVersion,
    requestedMode: payload.requestedMode,
    surface: null,
    foreground: null,
    mutationObserver: null,
    intersectionObserver: null,
    media: window.matchMedia('(prefers-color-scheme: dark)'),
    scheduled: false,
    viewportScheduled: false,
    currentMessageNodes: [],
  };

  const root = doc.documentElement;
  root.classList.add('diana-theme-host');
  root.dataset.dianaRequestedMode = payload.requestedMode;
  const variableMap = {
    '--diana-image-character-dark': payload.assets.characterDark,
    '--diana-image-character-light': payload.assets.characterLight,
    '--diana-image-line-art-upper': payload.assets.lineArtUpper,
    '--diana-image-line-art-corner': payload.assets.lineArtCorner,
    '--diana-image-line-art-lower': payload.assets.lineArtLower,
    '--diana-image-hand-star': payload.assets.handStar,
    '--diana-image-candy-wrapped': payload.assets.candyWrapped,
    '--diana-image-candy-lollipop': payload.assets.candyLollipop,
    '--diana-image-acao-heart': payload.assets.acaoHeart,
    '--diana-image-acao-cheer': payload.assets.acaoCheer,
  };
  for (const [name, value] of Object.entries(variableMap)) root.style.setProperty(name, value);

  let style = doc.getElementById(payload.styleId);
  if (!style) {
    style = doc.createElement('style');
    style.id = payload.styleId;
    doc.head.append(style);
  }
  const assetSwitch = `
html.diana-theme-host.diana-mode-dark { --diana-image-character: var(--diana-image-character-dark); }
html.diana-theme-host.diana-mode-light { --diana-image-character: var(--diana-image-character-light); }
`;
  style.textContent = `${payload.darkCss}\n${payload.lightCss}\n${assetSwitch}\n${payload.bridgeCss}`;

  function parseRgb(value) {
    const match = String(value).match(/rgba?\(([^)]+)\)/i);
    if (!match) return null;
    const parts = match[1].split(/[ ,/]+/).map(Number).filter(Number.isFinite);
    if (parts.length < 3 || (parts.length > 3 && parts[3] === 0)) return null;
    return parts.slice(0, 3);
  }

  function isDark() {
    if (state.requestedMode === 'dark') return true;
    if (state.requestedMode === 'light') return false;
    const candidates = [doc.body, doc.querySelector('main'), doc.querySelector('aside.app-shell-left-panel'), root].filter(Boolean);
    for (const node of candidates) {
      const rgb = parseRgb(getComputedStyle(node).backgroundColor);
      if (!rgb) continue;
      const [r, g, b] = rgb.map((v) => v / 255);
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return luminance < 0.48;
    }
    return state.media.matches;
  }

  function setMode() {
    const dark = isDark();
    root.classList.toggle('diana-mode-dark', dark);
    root.classList.toggle('diana-mode-light', !dark);
  }

  function findSurface() {
    const composer = doc.querySelector('[class*="_ComposerLayoutRoot_"]');
    const thread = doc.querySelector('.thread-scroll-container');
    const main = composer?.closest('main') || thread?.closest('main') || doc.querySelector('main');
    if (main) return main;
    const sidebar = doc.querySelector('aside.app-shell-left-panel');
    const rootChild = sidebar?.parentElement;
    if (rootChild && rootChild.children.length >= 2) {
      return [...rootChild.children].find((child) => child !== sidebar) ?? null;
    }
    return null;
  }

  function makeChrome() {
    const chrome = doc.createElement('div');
    chrome.id = 'diana-theme-chrome';
    chrome.setAttribute('aria-hidden', 'true');
    chrome.innerHTML = `
      <div class="diana-doodle-layer"></div>
      <div class="diana-corner-line"></div>
      <div class="diana-character-stars">
        <span class="diana-character-star diana-character-star-small"></span>
        <span class="diana-character-star diana-character-star-large"></span>
        <span class="diana-character-candy diana-character-candy-wrapped"></span>
        <span class="diana-character-candy diana-character-candy-lollipop"></span>
        <span class="diana-character-acao diana-character-acao-heart"></span>
        <span class="diana-character-acao diana-character-acao-cheer"></span>
      </div>`;
    return chrome;
  }

  function directSurfaceChild(surface, anchor) {
    if (!surface || !anchor || !surface.contains(anchor)) return null;
    let node = anchor;
    while (node.parentElement && node.parentElement !== surface) node = node.parentElement;
    return node.parentElement === surface ? node : null;
  }

  function findForeground(surface) {
    const thread = doc.querySelector('.thread-scroll-container');
    const composer = doc.querySelector('[class*="_ComposerLayoutRoot_"]');
    const threadChild = directSurfaceChild(surface, thread);
    const composerChild = directSurfaceChild(surface, composer);
    if (threadChild && composerChild && threadChild === composerChild) return threadChild;
    return threadChild ?? composerChild;
  }

  function ensureSurface() {
    const surface = findSurface();
    if (!surface) return false;
    if (state.surface && state.surface !== surface) {
      state.surface.classList.remove('diana-skin-surface');
      state.surface.querySelector(':scope > #diana-theme-chrome')?.remove();
    }
    const foreground = findForeground(surface);
    if (state.foreground && state.foreground !== foreground) {
      state.foreground.classList.remove('diana-skin-foreground');
    }
    state.surface = surface;
    state.foreground = foreground;
    surface.classList.add('diana-skin-surface');
    foreground?.classList.add('diana-skin-foreground');
    if (getComputedStyle(surface).position === 'static') {
      surface.dataset.dianaPositionPatched = 'true';
      surface.style.position = 'relative';
    }
    if (!surface.querySelector(':scope > #diana-theme-chrome')) surface.prepend(makeChrome());
    return true;
  }

  function panelHeadingRow() {
    const panels = [...doc.querySelectorAll('section[role="presentation"]')]
      .filter((panel) => {
        const rect = panel.getBoundingClientRect();
        return rect.width >= 180
          && rect.width <= 520
          && rect.height >= 48
          && rect.right >= window.innerWidth - 80
          && rect.left > window.innerWidth * 0.55;
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return bRect.left - aRect.left || aRect.top - bRect.top;
      });

    for (const panel of panels) {
      const header = panel.querySelector(':scope > header') ?? panel.querySelector('header');
      if (!header) continue;
      const headerRect = header.getBoundingClientRect();
      if (headerRect.width <= 0 || headerRect.height <= 0) continue;

      const row = header.querySelector(':scope > button[aria-expanded]') ?? header;
      const candidates = [
        ...row.querySelectorAll('h1,h2,h3,h4,[role="heading"],span,p,div'),
        row,
      ];
      const label = candidates.find((element) => {
        if (element.closest('[aria-hidden="true"]')) return false;
        const nestedButton = element.closest('button');
        if (nestedButton && nestedButton !== row) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const ownText = [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? '')
          .join(' ')
          .trim();
        const text = ownText || (element.children.length === 0 ? element.textContent?.trim() : '');
        return Boolean(text && /[\p{L}\p{N}]/u.test(text));
      });
      if (label) return row;
    }
    return null;
  }

  function ensurePanelHeadingStar() {
    const row = panelHeadingRow();
    const stars = [...doc.querySelectorAll('.diana-panel-heading-star[data-diana-injected="panel-heading-star"]')];
    doc.querySelectorAll('[data-diana-injected="heading-star"]').forEach((node) => node.remove());
    if (!row) {
      stars.forEach((star) => star.remove());
      return;
    }
    let star = row.querySelector(':scope > .diana-panel-heading-star[data-diana-injected="panel-heading-star"]');
    stars.forEach((candidate) => {
      if (candidate !== star) candidate.remove();
    });
    if (star) return;
    star = doc.createElement('span');
    star.className = 'diana-panel-heading-star';
    star.dataset.dianaInjected = 'panel-heading-star';
    star.setAttribute('aria-hidden', 'true');
    row.prepend(star);
  }

  const profiles = {
    sparse: { pattern: [.26,.35,.29,.46,.31,.39,.25,.43,.33,.28,.48,.30,.37,.27,.41,.34,.29,.45,.32,.38,.25,.44,.30], majors: [.56,.62,.53,.59,.64,.55] },
    balanced: { pattern: [.24,.33,.27,.41,.30,.36,.25,.39,.32,.28,.43,.29,.35,.26,.40,.31,.27,.42,.30,.37,.24,.38,.28,.34,.26,.41,.29], majors: [.49,.55,.47,.52,.57,.50,.54] },
    dense: { pattern: [.23,.31,.26,.36,.28,.33,.24,.35,.29,.27,.37,.25,.32,.28,.34,.24,.36,.30,.26,.33,.23,.35,.27,.31,.25,.34,.29,.24,.32], majors: [.42,.47,.40,.45,.43,.48,.41,.46,.44] },
  };

  function ensureRail() {
    const nav = doc.querySelector('nav[aria-label="用户消息"],nav[aria-label="User messages"]');
    if (!nav) return 0;
    const buttons = [...nav.querySelectorAll(':scope button')];
    const profile = buttons.length <= 32 ? profiles.sparse : buttons.length <= 96 ? profiles.balanced : profiles.dense;
    buttons.forEach((button, index) => {
      const block = Math.floor(index / profile.pattern.length);
      const slot = (index + block * 7) % profile.pattern.length;
      const major = index % 5 === 0;
      const scale = major ? profile.majors[Math.floor(index / 5) % profile.majors.length] : profile.pattern[slot];
      button.style.setProperty('--diana-art-scale', String(scale));
      button.toggleAttribute('data-diana-rail-major', major);
    });
    return buttons.length;
  }

  function userMessageNodes() {
    const selectors = [
      '[data-message-author-role="user"]',
      '[data-message-role="user"]',
      '[data-role="user"]',
      '[data-testid*="user-message"]',
    ];
    const found = [];
    for (const selector of selectors) {
      for (const node of doc.querySelectorAll(selector)) if (!found.includes(node)) found.push(node);
    }
    return found.filter((node) => node.getBoundingClientRect().height > 0);
  }

  function updateViewportCurrent() {
    const nav = doc.querySelector('nav[aria-label="用户消息"],nav[aria-label="User messages"]');
    if (!nav) return;
    const buttons = [...nav.querySelectorAll(':scope button')];
    const messages = userMessageNodes();
    if (!messages.length || Math.abs(messages.length - buttons.length) > 2) return;
    const scroller = doc.querySelector('.thread-scroll-container') || doc.scrollingElement;
    const bounds = scroller === doc.scrollingElement
      ? { top: 0, bottom: window.innerHeight }
      : scroller.getBoundingClientRect();
    const center = (bounds.top + bounds.bottom) / 2;
    let best = -1;
    let distance = Infinity;
    messages.forEach((message, index) => {
      const rect = message.getBoundingClientRect();
      if (rect.bottom < bounds.top || rect.top > bounds.bottom) return;
      const d = Math.abs((rect.top + rect.bottom) / 2 - center);
      if (d < distance) { distance = d; best = index; }
    });
    if (best < 0) return;
    buttons.forEach((button, index) => button.toggleAttribute('data-diana-viewport-current', index === best));
  }

  function refresh() {
    state.scheduled = false;
    setMode();
    ensureSurface();
    ensurePanelHeadingStar();
    ensureRail();
    updateViewportCurrent();
  }

  function scheduleRefresh() {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(refresh);
  }

  function scheduleViewportRefresh() {
    if (state.viewportScheduled) return;
    state.viewportScheduled = true;
    requestAnimationFrame(() => {
      state.viewportScheduled = false;
      updateViewportCurrent();
    });
  }

  state.mutationObserver = new MutationObserver(scheduleRefresh);
  state.mutationObserver.observe(root, { subtree: true, childList: true });
  state.media.addEventListener?.('change', scheduleRefresh);
  window.addEventListener('resize', scheduleRefresh, { passive: true });
  doc.addEventListener('click', scheduleRefresh, { passive: true, capture: true });
  doc.addEventListener('scroll', scheduleViewportRefresh, { passive: true, capture: true });

  state.disable = () => {
    state.mutationObserver?.disconnect();
    state.intersectionObserver?.disconnect();
    state.media.removeEventListener?.('change', scheduleRefresh);
    window.removeEventListener('resize', scheduleRefresh);
    doc.removeEventListener('click', scheduleRefresh, true);
    doc.removeEventListener('scroll', scheduleViewportRefresh, true);
    doc.getElementById(payload.styleId)?.remove();
    doc.querySelectorAll('[data-diana-injected="heading-star"],[data-diana-injected="panel-heading-star"]').forEach((node) => node.remove());
    doc.querySelectorAll('nav[aria-label="用户消息"] button,nav[aria-label="User messages"] button').forEach((button) => {
      button.removeAttribute('data-diana-rail-major');
      button.removeAttribute('data-diana-viewport-current');
      button.style.removeProperty('--diana-art-scale');
    });
    doc.querySelectorAll('#diana-theme-chrome').forEach((node) => node.remove());
    doc.querySelectorAll('.diana-skin-surface').forEach((surface) => {
      surface.classList.remove('diana-skin-surface');
      if (surface.dataset.dianaPositionPatched === 'true') {
        surface.style.removeProperty('position');
        delete surface.dataset.dianaPositionPatched;
      }
    });
    doc.querySelectorAll('.diana-skin-foreground').forEach((foreground) => {
      foreground.classList.remove('diana-skin-foreground');
    });
    root.classList.remove('diana-theme-host', 'diana-mode-dark', 'diana-mode-light');
    delete root.dataset.dianaRequestedMode;
    Object.keys(variableMap).forEach((name) => root.style.removeProperty(name));
    delete window[KEY];
    return true;
  };

  window[KEY] = state;
  refresh();
  return {
    adapterVersion: state.version,
    requestedMode: state.requestedMode,
    mode: root.classList.contains('diana-mode-dark') ? 'dark' : 'light',
    surfaceFound: Boolean(state.surface),
    overlayFound: Boolean(doc.getElementById('diana-theme-chrome')),
    railButtons: doc.querySelectorAll('nav[aria-label="用户消息"] button,nav[aria-label="User messages"] button').length,
    semanticUserMessages: userMessageNodes().length,
  };
}

function disableExpression() {
  return `(() => {
    const adapter = window[${JSON.stringify(ADAPTER_KEY)}];
    const disabled = adapter?.disable ? adapter.disable() : false;
    document.getElementById(${JSON.stringify(STYLE_ID)})?.remove();
    document.documentElement.classList.remove('diana-theme-host','diana-mode-dark','diana-mode-light');
    delete document.documentElement.dataset.dianaRequestedMode;
    return { disabled, stylePresent: Boolean(document.getElementById(${JSON.stringify(STYLE_ID)})) };
  })()`;
}

function statusExpression() {
  return `(() => {
    const root = document.documentElement;
    const adapter = window[${JSON.stringify(ADAPTER_KEY)}];
    const overlay = document.getElementById(${JSON.stringify(OVERLAY_ID)});
    const surface = document.querySelector('.diana-skin-surface');
    return {
      adapterVersion: adapter?.version ?? null,
      requestedMode: adapter?.requestedMode ?? root.dataset.dianaRequestedMode ?? null,
      stylePresent: Boolean(document.getElementById(${JSON.stringify(STYLE_ID)})),
      hostClassPresent: root.classList.contains('diana-theme-host'),
      mode: root.classList.contains('diana-mode-dark') ? 'dark' : (root.classList.contains('diana-mode-light') ? 'light' : null),
      overlayPresent: Boolean(overlay),
      overlayPointerEvents: overlay ? getComputedStyle(overlay).pointerEvents : null,
      surfacePresent: Boolean(surface),
      foregroundCount: document.querySelectorAll('.diana-skin-foreground').length,
      panelHeadingStarCount: document.querySelectorAll('.diana-panel-heading-star[data-diana-injected="panel-heading-star"]').length,
      environmentStarCount: document.querySelectorAll('.diana-panel-heading-star[data-diana-injected="panel-heading-star"]').length,
      railButtonCount: document.querySelectorAll('nav[aria-label="用户消息"] button,nav[aria-label="User messages"] button').length,
      currentMarkerCount: document.querySelectorAll('.diana-viewport-current').length,
      composerPresent: Boolean(document.querySelector('textarea,[contenteditable="true"],form')),
    };
  })()`;
}

function capabilityExpression() {
  return `(() => {
    const doc = document;
    const root = doc.documentElement;
    const body = doc.body;
    const main = doc.querySelector('main');
    const composer = doc.querySelector('[class*="_ComposerLayoutRoot_"]');
    const thread = doc.querySelector('.thread-scroll-container');
    const sidebar = doc.querySelector('aside.app-shell-left-panel');
    const shellParent = sidebar?.parentElement ?? null;
    const shellSibling = shellParent
      ? [...shellParent.children].find((child) => child !== sidebar) ?? null
      : null;
    const surface = composer?.closest('main') || thread?.closest('main') || main || shellSibling;
    const rect = surface?.getBoundingClientRect() ?? null;
    const shellSignalCount = [main, composer, thread, sidebar].filter(Boolean).length;
    return {
      ready: doc.readyState === 'interactive' || doc.readyState === 'complete',
      documentPresent: Boolean(root && doc.head && body),
      surfacePresent: Boolean(surface?.isConnected),
      surfaceVisible: Boolean(rect && rect.width >= 280 && rect.height >= 220),
      shellSignalCount,
      mainPresent: Boolean(main),
      sidebarPresent: Boolean(sidebar),
      threadPresent: Boolean(thread),
      composerPresent: Boolean(composer),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  })()`;
}

function capabilityPassed(result) {
  return Boolean(
    result?.ready
      && result?.documentPresent
      && result?.surfacePresent
      && result?.surfaceVisible
      && Number(result?.shellSignalCount ?? 0) >= 1
  );
}

async function probePages(port) {
  const pages = await targets(port);
  const inspected = [];
  for (const page of pages) {
    const result = await evaluate(page.webSocketDebuggerUrl, capabilityExpression());
    inspected.push({ page, result, compatible: capabilityPassed(result) });
  }
  const compatible = inspected.filter((item) => item.compatible);
  if (!compatible.length) {
    fail('Current Codex renderer did not expose the required safe theme anchors');
  }
  return { inspected, compatible };
}

async function targets(port) {
  const list = await requestJson(port, '/json/list');
  if (!Array.isArray(list)) fail('Unexpected target list');
  const pages = list.filter((target) => target.type === 'page' && String(target.url).startsWith('app://') && String(target.webSocketDebuggerUrl).startsWith('ws://127.0.0.1:'));
  if (!pages.length) fail('No verified app:// Codex renderer target was found');
  return pages;
}

function selfTest() {
  const pkg = getPackage();
  if (pkg.Family !== manifest.packageFamily) fail('Unexpected Codex package family');
  if (!fs.existsSync(pkg.Executable)) fail('Installed Codex executable is missing');
  const required = [MANIFEST_PATH, path.join(ROOT, manifest.themes.dark), path.join(ROOT, manifest.themes.light), ...Object.values(manifest.assets).map((item) => path.join(ROOT, item))];
  const missing = required.filter((file) => !fs.existsSync(file));
  if (missing.length) fail(`Missing ${missing.length} required files`);
  for (const [relative, expected] of Object.entries(manifest.sha256)) {
    const actual = createHash('sha256').update(fs.readFileSync(path.join(ROOT, relative))).digest('hex');
    if (actual !== expected) fail(`SHA-256 mismatch: ${relative}`);
  }
  for (const cssPath of [path.join(ROOT, manifest.themes.dark), path.join(ROOT, manifest.themes.light)]) {
    const css = fs.readFileSync(cssPath, 'utf8');
    if (/https?:\/\//i.test(css)) fail(`Remote URL found in ${path.basename(cssPath)}`);
    if (!css.includes('html.diana-theme-host')) fail(`Unscoped theme CSS: ${path.basename(cssPath)}`);
  }
  const result = {
    status: 'ok',
    adapterVersion: manifest.adapterVersion,
    compatibilityMode: manifest.compatibilityMode,
    installedCodexVersion: pkg.Version,
    files: required.length,
  };
  console.log(JSON.stringify(result, null, 2));
}

async function probe(values) {
  const port = numeric(values.port, 'port');
  const mainPid = numeric(values['main-pid'], 'main-pid');
  const { pkg } = validateRuntime(mainPid, port);
  const { inspected, compatible } = await probePages(port);
  appendEvent('probe_success', {
    codexVersion: pkg.Version,
    mainPid,
    port,
    rendererCount: inspected.length,
    compatibleRendererCount: compatible.length,
  });
  console.log(JSON.stringify({
    status: 'compatible',
    codexVersion: pkg.Version,
    mainPid,
    port,
    rendererCount: inspected.length,
    compatibleRendererCount: compatible.length,
    results: inspected.map(({ result, compatible: isCompatible }) => ({ ...result, compatible: isCompatible })),
  }, null, 2));
}

async function apply(values) {
  const port = numeric(values.port, 'port');
  const mainPid = numeric(values['main-pid'], 'main-pid');
  const requestedMode = themeMode(values.mode);
  const { pkg } = validateRuntime(mainPid, port);
  const payload = buildPayload(requestedMode);
  const expression = `(${bootstrap.toString()})(${JSON.stringify(payload)})`;
  const { compatible } = await probePages(port);
  const results = [];
  try {
    for (const { page } of compatible) {
      const result = await evaluate(page.webSocketDebuggerUrl, expression);
      if (!result?.surfaceFound || !result?.overlayFound) {
        fail('Theme post-check failed after applying to a compatible renderer');
      }
      results.push(result);
    }
  } catch (error) {
    for (const { page } of compatible) {
      try { await evaluate(page.webSocketDebuggerUrl, disableExpression()); } catch { }
    }
    throw error;
  }
  appendEvent('apply_success', { codexVersion: pkg.Version, mainPid, port, requestedMode, rendererCount: results.length });
  console.log(JSON.stringify({ status: 'applied', codexVersion: pkg.Version, mainPid, port, requestedMode, rendererCount: results.length, results }, null, 2));
}

async function disable(values) {
  const port = numeric(values.port, 'port');
  const mainPid = numeric(values['main-pid'], 'main-pid');
  const { pkg } = validateRuntime(mainPid, port);
  const pages = await targets(port);
  const results = [];
  for (const page of pages) results.push(await evaluate(page.webSocketDebuggerUrl, disableExpression()));
  appendEvent('disable_success', { codexVersion: pkg.Version, mainPid, port, rendererCount: results.length });
  console.log(JSON.stringify({ status: 'disabled', mainPid, port, rendererCount: results.length, results }, null, 2));
}

async function status(values) {
  const port = numeric(values.port, 'port');
  const mainPid = numeric(values['main-pid'], 'main-pid');
  const { pkg } = validateRuntime(mainPid, port);
  const pages = await targets(port);
  const results = [];
  for (const page of pages) results.push(await evaluate(page.webSocketDebuggerUrl, statusExpression()));
  console.log(JSON.stringify({ status: 'inspected', codexVersion: pkg.Version, mainPid, port, rendererCount: results.length, results }, null, 2));
}

const manifest = readJson(MANIFEST_PATH);
const { command, values } = parseArgs(process.argv);

try {
  if (command === 'self-test') selfTest();
  else if (command === 'probe') await probe(values);
  else if (command === 'apply') await apply(values);
  else if (command === 'disable') await disable(values);
  else if (command === 'status') await status(values);
  else fail(`Unknown command: ${command}`);
} catch (error) {
  appendEvent('adapter_error', { code: String(error?.message ?? error).slice(0, 240) });
  console.error(`Diana adapter error: ${error.message}`);
  process.exitCode = 1;
}
