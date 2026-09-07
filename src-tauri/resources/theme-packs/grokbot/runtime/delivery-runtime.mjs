import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function options(root, name, env = process.env, args = process.argv.slice(2)) {
  const at = args.indexOf('--exe');
  const executable = at >= 0 ? args[at + 1] : env.DIANA_TARGET_EXE;
  const dataRoot = path.join(path.dirname(executable || root), 'data');
  const portable = Boolean(executable && fs.existsSync(dataRoot));
  return {
    executable: executable || '',
    settings: portable ? path.join(dataRoot, 'user-data', 'User', 'settings.json')
      : path.join(env.APPDATA || '', 'Cursor', 'User', 'settings.json'),
    extensions: portable ? path.join(dataRoot, 'extensions') : path.join(env.USERPROFILE || '', '.cursor', 'extensions'),
    expectedName: name,
    accepted: args.includes('--accept-cdp-risk') || env.DIANA_CDP_CONSENT === 'accepted-for-this-launch',
    root,
  };
}

export function checkPrerequisites(config, action) {
  if (Number(process.versions.node.split('.')[0]) < 22 || typeof WebSocket !== 'function') {
    throw new Error('NODE_RUNTIME_UNSUPPORTED: Node.js 22+ with built-in WebSocket is required.');
  }
  if (action === 'self-test') return;
  if (process.platform !== 'win32') throw new Error('WINDOWS_REQUIRED');
  if (!path.isAbsolute(config.executable) || path.basename(config.executable).toLowerCase() !== config.expectedName.toLowerCase() || !fs.existsSync(config.executable)) {
    throw new Error(`APP_PATH_REQUIRED: pass --exe with an existing official ${config.expectedName}`);
  }
  if (action === 'start' && !config.accepted) {
    throw new Error('CDP_CONSENT_REQUIRED: read SECURITY.md; explicit --accept-cdp-risk is required.');
  }
}

export function sha256(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

export function verifyBundle(root) {
  const manifest = fs.readFileSync(path.join(root, 'SHA256SUMS.txt'), 'utf8');
  const seen = new Set();
  for (const line of manifest.trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9._/-]+)$/i.exec(line);
    if (!match) throw new Error('BUNDLE_MANIFEST_INVALID');
    const [, hash, relative] = match;
    if (relative.split('/').some(part => !part || part === '.' || part === '..') || seen.has(relative)) throw new Error('BUNDLE_PATH_INVALID');
    seen.add(relative);
    const file = path.join(root, relative);
    assertNoLinks(root, file);
    if (sha256(file) !== hash.toLowerCase()) throw new Error(`BUNDLE_HASH_MISMATCH: ${relative}`);
  }
  for (const required of ['adapter.mjs', 'delivery-runtime.mjs', 'theme.css', 'README-LOCAL.txt']) {
    if (!seen.has(required)) throw new Error(`BUNDLE_FILE_UNPROTECTED: ${required}`);
  }
  return seen.size;
}

export function assertNoLinks(root, target) {
  const base = path.resolve(root), resolved = path.resolve(target);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) throw new Error('UNSAFE_PATH');
  let current = resolved;
  while (true) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('SYMLINK_REJECTED');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function trustedSocket(url, port) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'ws:' && parsed.hostname === '127.0.0.1' && parsed.port === String(port)
      && !parsed.username && !parsed.password && !parsed.hash && /^\/devtools\/page\/[^/]+$/.test(parsed.pathname);
  } catch { return false; }
}
