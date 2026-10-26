// Public, version-pinned launcher adapter. No personal registration is required.
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VERSION = '3.16.3.8992';
export const ADAPTER = 'reviewed-zcode-3.16.3-v1';
export const SIGNER = '6F7B147DC610F91425750D2449C46002C3385BCF';
export const ASAR_SHA256 = '21183dbf3bee0a786d6cc3b648dda96f7d443c9674092538b2a6ffb72002822e';
export const WORKSPACE = '#root [data-workspace-conversation-frame="true"]';

export function assertTrust(machine, resourceHash) {
  if (machine.fileVersion !== VERSION || machine.productVersion !== VERSION) throw new Error('ZCODE_VERSION_MISMATCH');
  if (machine.signature !== 'Valid' || machine.signer?.toUpperCase() !== SIGNER) throw new Error('ZCODE_SIGNATURE_MISMATCH');
  if (resourceHash !== ASAR_SHA256) throw new Error('ZCODE_RESOURCE_MISMATCH');
}

export function assertSession(session, executable) {
  if (!session || session.version !== VERSION || session.adapterVersion !== ADAPTER
    || typeof session.executable !== 'string' || session.executable.toLowerCase() !== executable.toLowerCase()
    || session.address !== '127.0.0.1' || !Number.isInteger(session.pid) || session.pid <= 0
    || !Number.isInteger(session.port) || session.port < 49152 || session.port > 65535) {
    throw new Error('NO_OWNED_SESSION');
  }
}

export function assertListener(session, executable, rows, processes) {
  assertSession(session, executable);
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].address !== '127.0.0.1'
    || rows[0].port !== session.port) throw new Error('LISTENER_NOT_LOOPBACK');
  const owner = processes.find(p => p.pid === rows[0].pid);
  if (!owner || owner.pid !== session.pid || !owner.created
    || (session.created && owner.created !== session.created)) throw new Error('LISTENER_OWNER_MISMATCH');
  if (!rows[0].hasWindow) throw new Error('VISIBLE_ZCODE_WINDOW_NOT_FOUND');
  return owner;
}

export function selectTarget(rows, executable, port) {
  const expected = pathToFileURL(join(dirname(executable), 'resources/app.asar/out/renderer/index.html')).href.toLowerCase();
  const pages = Array.isArray(rows) ? rows.filter(row => row.type === 'page' && typeof row.url === 'string'
    && row.url.split(/[?#]/)[0].toLowerCase() === expected) : [];
  if (pages.length !== 1 || !pages[0].webSocketDebuggerUrl) throw new Error('EXPECTED_RENDERER_NOT_FOUND');
  const url = new URL(pages[0].webSocketDebuggerUrl);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || Number(url.port) !== port
    || url.username || url.password || !url.pathname.startsWith('/devtools/page/')) throw new Error('CDP_ADDRESS_MISMATCH');
  return url.href;
}
