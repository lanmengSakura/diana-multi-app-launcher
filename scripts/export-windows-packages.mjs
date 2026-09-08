import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Export only: no install, executable launch, git, upload or release mutation.
export function exportPackages({ binary, setup, out, version, arch = 'x64' }) {
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version) || !['x64', 'arm64'].includes(arch)) {
    throw new Error('Invalid version or architecture for package names.');
  }
  const inputs = [
    [resolve(binary), `diana-multi-app-launcher_${version}_${arch}-portable.exe`],
    ...(setup ? [[resolve(setup), `Diana-Multi-App-Launcher_${version}_${arch}-setup.exe`]] : [])
  ];
  const packages = inputs.map(([source, name]) => {
    const bytes = readFileSync(source);
    if (bytes.length < 2 || bytes.subarray(0, 2).toString('ascii') !== 'MZ') throw new Error(`Not a Windows executable: ${basename(source)}`);
    return { source, name, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const destination = resolve(out);
  if (existsSync(destination)) throw new Error('Output already exists; choose a new folder. Existing packages were not changed.');
  mkdirSync(dirname(destination), { recursive: true });
  mkdirSync(destination);
  for (const item of packages) {
    const target = resolve(destination, item.name);
    copyFileSync(item.source, target, constants.COPYFILE_EXCL);
    if (sha256(readFileSync(target)) !== item.sha256) throw new Error(`Copy verification failed: ${item.name}`);
  }
  writeFileSync(resolve(destination, 'SHA256SUMS.txt'), packages.map(item => `${item.sha256}  ${item.name}\n`).join(''), { flag: 'wx' });
  return { out: destination, packages: packages.map(({ source: _source, ...item }) => item) };
}

function main() {
  const { values } = parseArgs({ options: {
    'release-dir': { type: 'string' }, binary: { type: 'string' }, setup: { type: 'string' },
    out: { type: 'string' }, arch: { type: 'string', default: 'x64' }
  } });
  const config = JSON.parse(readFileSync(resolve(projectRoot, 'src-tauri/tauri.conf.json'), 'utf8'));
  const targetDir = process.env.CARGO_TARGET_DIR ? resolve(process.env.CARGO_TARGET_DIR) : resolve(projectRoot, 'src-tauri/target');
  const releaseDir = values['release-dir'] ? resolve(values['release-dir']) : resolve(targetDir, 'release');
  const binary = values.binary ?? resolve(releaseDir, 'diana-codex-launcher.exe');
  const nsisDir = resolve(releaseDir, 'bundle/nsis');
  const candidates = existsSync(nsisDir) ? readdirSync(nsisDir).filter(name => name.endsWith(`_${config.version}_${values.arch}-setup.exe`)) : [];
  if (!values.setup && candidates.length > 1) throw new Error('Multiple matching installers; pass --setup explicitly.');
  const setup = values.setup ?? (candidates.length === 1 ? resolve(nsisDir, candidates[0]) : undefined);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = values.out ?? resolve(projectRoot, `artifacts/local-packages-${config.version}-${stamp}`);
  const result = exportPackages({ binary, setup, out, version: config.version, arch: values.arch });
  console.log(JSON.stringify(result, null, 2));
  if (!setup) console.log('No matching NSIS installer found: exported the portable executable only.');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
