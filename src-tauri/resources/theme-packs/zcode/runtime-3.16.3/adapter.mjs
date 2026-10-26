// Opt-in public adapter. Importing this module never inspects or starts an app.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VERSION, ADAPTER, WORKSPACE, assertTrust, assertSession, assertListener, selectTarget } from './rules.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SESSION = join(ROOT, 'state/session.json');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const files = { 'character-dark': 'diana-night-v3.png', 'character-light': 'diana-corner-cutout-v2.png',
  doodle: 'diana-doodle-chalk-v2-approved.png', upper: 'diana-line-art-approved-upper.png',
  corner: 'diana-left-top-detailed-corner-mask-v7.png', star: 'diana-hand-star-reference-v2.png',
  'candy-wrapped': 'diana-candy-wrapped-v1.png', 'candy-lollipop': 'diana-candy-lollipop-v1.png',
  'acao-heart': 'acao-heart-v3.png', 'acao-cheer': 'acao-cheer-v1.png' };

export function expression(theme, assetRoot = join(ROOT, 'assets'), cssPath = join(ROOT, 'theme.css')) {
  if (!['dark', 'light', 'auto'].includes(theme)) throw new Error('INVALID_THEME');
  const assets = Object.fromEntries(Object.entries(files).map(([key, name]) =>
    [key, `data:image/png;base64,${readFileSync(join(assetRoot, name)).toString('base64')}`]));
  const css = readFileSync(cssPath, 'utf8') + '\n' + readFileSync(join(ROOT, 'layout.css'), 'utf8');
  return readFileSync(join(ROOT, 'runtime-template.js'), 'utf8')
    .replace('__DIANA_PAYLOAD__', () => JSON.stringify({ adapterVersion: ADAPTER, theme, assets, css }));
}

function event(name, fields = {}) {
  const safe = Object.fromEntries(Object.entries(fields).filter(([key]) => ['pid', 'port', 'version', 'theme', 'code'].includes(key)));
  appendFileSync(join(ROOT, 'logs/events.jsonl'), JSON.stringify({ at: new Date().toISOString(), event: name, ...safe }) + '\n');
}
function save(session) {
  session.updatedAt = new Date().toISOString();
  writeFileSync(SESSION, JSON.stringify(session, null, 2) + '\n');
}
function readSession() {
  if (!existsSync(SESSION)) return null;
  const raw = readFileSync(SESSION);
  if (raw.length > 8192) throw new Error('INVALID_SESSION');
  return JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
}
function powershell(script, executable) {
  const system = process.env.SystemRoot || 'C:\\Windows';
  const ps = process.env.DIANA_POWERSHELL_EXE || join(system, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const env = { ...process.env, DIANA_ZCODE_EXE: executable,
    PSModulePath: [join(process.env.ProgramFiles || 'C:\\Program Files', 'WindowsPowerShell/Modules'),
      join(system, 'System32/WindowsPowerShell/v1.0/Modules')].join(';') };
  const command = "$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);" + script;
  try {
    return JSON.parse(execFileSync(ps, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')],
      { env, windowsHide: true, timeout: 15000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).replace(/^\uFEFF/, '').trim());
  } catch { throw new Error('POWERSHELL_PREFLIGHT_FAILED'); }
}
function processes(executable) {
  return powershell(`$p=@(Get-CimInstance Win32_Process -Filter "Name='ZCode.exe'" | Where-Object {$_.ExecutablePath -ieq $env:DIANA_ZCODE_EXE} | ForEach-Object {[pscustomobject]@{pid=[int]$_.ProcessId;created=$_.CreationDate.ToUniversalTime().ToString('o')}});ConvertTo-Json -InputObject $p -Compress`, executable);
}
async function trust(executable) {
  const machine = powershell(`$i=Get-Item -LiteralPath $env:DIANA_ZCODE_EXE;$s=Get-AuthenticodeSignature -LiteralPath $env:DIANA_ZCODE_EXE;[pscustomobject]@{fileVersion=$i.VersionInfo.FileVersion;productVersion=$i.VersionInfo.ProductVersion;signature=$s.Status.ToString();signer=$s.SignerCertificate.Thumbprint}|ConvertTo-Json -Compress`, executable);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(dirname(executable), 'resources/app.asar'))) hash.update(chunk);
  assertTrust(machine, hash.digest('hex'));
  return machine;
}
async function choosePort() {
  for (let attempt = 0; attempt < 16; attempt++) {
    const port = await new Promise((resolve, reject) => {
      const server = createServer(); server.once('error', reject);
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
        const port = server.address().port; server.close(error => error ? reject(error) : resolve(port));
      });
    });
    if (port >= 49152 && port <= 65535) return port;
  }
  throw new Error('NO_HIGH_LOOPBACK_PORT');
}
function listener(session, executable) {
  assertSession(session, executable);
  const rows = powershell(`$rows=@(Get-NetTCPConnection -State Listen -LocalPort ${session.port} -ErrorAction SilentlyContinue | ForEach-Object {[pscustomobject]@{pid=[int]$_.OwningProcess;address=[string]$_.LocalAddress;port=[int]$_.LocalPort;hasWindow=[bool]((Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).MainWindowHandle)}});ConvertTo-Json -InputObject $rows -Compress`, executable);
  return assertListener(session, executable, rows, processes(executable));
}
async function target(session, executable) {
  const owner = listener(session, executable);
  const response = await fetch(`http://127.0.0.1:${session.port}/json/list`, { redirect: 'error', signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error('CDP_ENDPOINT_UNAVAILABLE');
  return { url: selectTarget(await response.json(), executable, session.port), owner };
}
async function evaluate(session, executable, expression) {
  const { url } = await target(session, executable);
  // Recheck ownership before the WebSocket, not just before HTTP discovery.
  listener(session, executable);
  const socket = new WebSocket(url);
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP_CONNECT_TIMEOUT')), 5000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP_CONNECT_FAILED')); }, { once: true });
    });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP_EVALUATION_TIMEOUT')), 20000);
      socket.addEventListener('message', event => {
        let msg; try { msg = JSON.parse(String(event.data)); } catch { return; }
        if (msg.id !== 1) return;
        clearTimeout(timer);
        if (msg.error || msg.result?.exceptionDetails) reject(new Error('CDP_EVALUATION_FAILED'));
        else resolve(msg.result?.result?.value);
      });
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    });
  } finally { socket.close(); }
}

async function main() {
  const action = process.argv[2] || 'status';
  const theme = process.argv.includes('--theme') ? process.argv[process.argv.indexOf('--theme') + 1] : 'auto';
  if (!['dark', 'light', 'auto'].includes(theme)) throw new Error('INVALID_THEME');
  if (!['status', 'preflight', 'start', 'apply', 'disable', 'verify'].includes(action)) throw new Error('UNKNOWN_COMMAND');
  // Saving an EXE association or importing this module is never consent.
  if (action === 'start' && !process.argv.includes('--approved')) throw new Error('RISK_CONFIRMATION_REQUIRED');
  const executable = process.env.DIANA_ZCODE_EXE;
  if (!executable || !isAbsolute(executable) || /^\\\\|^\/\//.test(executable)) throw new Error('LOCAL_EXECUTABLE_REQUIRED');
  const machine = await trust(executable);
  if (action === 'status' || action === 'preflight') {
    console.log(JSON.stringify({ version: VERSION, signature: machine.signature, adapterVersion: ADAPTER, status: 'validated' })); return;
  }
  for (const name of ['state', 'logs']) mkdirSync(join(ROOT, name), { recursive: true });
  let session = readSession();
  if (action === 'start') {
    if (processes(executable).length) throw new Error('ZCODE_ALREADY_RUNNING');
    const port = await choosePort();
    const child = spawn(executable, ['--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`],
      { detached: true, stdio: 'ignore', windowsHide: false });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', () => reject(new Error('ZCODE_START_FAILED'))); });
    child.unref();
    session = { adapterVersion: ADAPTER, version: VERSION, executable, pid: child.pid, address: '127.0.0.1', port,
      theme, status: 'launching', appFilesModified: false, persistenceCreated: false };
    save(session); event('start', { pid: session.pid, port, version: VERSION });
    const deadline = Date.now() + 60000;
    let ready = false;
    while (Date.now() < deadline) {
      try { const { owner } = await target(session, executable); session.created = owner.created; save(session); ready = true; break; }
      catch { await pause(500); }
    }
    if (!ready) throw new Error('EXPECTED_RENDERER_TIMEOUT');
  } else {
    assertSession(session, executable);
    if (!session.created) throw new Error('NO_OWNED_SESSION');
  }
  if (action === 'disable') {
    const result = await evaluate(session, executable, 'globalThis.__DIANA_ZCODE_THEME__?.disable() ?? {disabled:true}');
    if (!result?.disabled) throw new Error('DISABLE_NOT_CONFIRMED');
    session.status = 'disabled'; save(session); event('disabled', { pid: session.pid });
    console.log(JSON.stringify({ disabled: true, portStillOpen: true })); return;
  }
  if (action === 'verify') {
    console.log(JSON.stringify(await evaluate(session, executable, 'globalThis.__DIANA_ZCODE_THEME__?.snapshot() ?? {mounted:false}'))); return;
  }
  const ready = await evaluate(session, executable, `!!document.querySelector(${JSON.stringify(WORKSPACE)}) && !!document.querySelector('#root #content[data-panel]')`);
  if (!ready) {
    Object.assign(session, { status: 'waiting_workspace', theme }); save(session); event('waiting_workspace', { pid: session.pid });
    console.log(JSON.stringify({ status: 'waiting_workspace', mounted: false })); return;
  }
  const result = await evaluate(session, executable, expression(theme));
  if (!result?.mounted || result.adapterVersion !== ADAPTER || !result.pointerSafe || !result.belowContent
    || (theme !== 'auto' && result.rootTheme !== theme)) throw new Error('MOUNT_STATUS_INVALID');
  Object.assign(session, { status: 'mounted', theme, rootTheme: result.rootTheme }); save(session);
  event('mounted', { pid: session.pid, version: VERSION, theme });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch(error => {
  const code = /^[A-Z_]+$/.test(error.message) ? error.message : 'ADAPTER_FAILED';
  try { if (existsSync(join(ROOT, 'logs'))) event('error', { code }); } catch {}
  console.error(JSON.stringify({ status: 'error', code, note: '如果应用已启动，请完整退出 ZCode 关闭临时端口。' }));
  process.exitCode = 1;
});
