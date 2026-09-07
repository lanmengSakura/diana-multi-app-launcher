import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src-tauri/src/reviewed_adapter_files.rs'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/resources/theme-packs/catalog.json'), 'utf8'));
const zcodeRoot = path.join(root, 'src-tauri/resources/theme-packs/zcode/runtime');
let zcodeFiles = 0;
for (const line of fs.readFileSync(path.join(zcodeRoot,'manifest.sha256'),'utf8').trim().split(/\r?\n/)) {
  const match = /^([A-Fa-f0-9]{64}) \*([A-Za-z0-9._-]+)$/.exec(line);
  if (!match) throw new Error('Invalid ZCode file manifest');
  const bytes = fs.readFileSync(path.join(zcodeRoot,match[2]));
  if (bytes.includes(13) || createHash('sha256').update(bytes).digest('hex') !== match[1].toLowerCase()) throw new Error(`ZCode protected bytes changed: ${match[2]}`);
  zcodeFiles++;
}
if (zcodeFiles !== 9 || !fs.readFileSync(path.join(root,'.gitattributes'),'utf8').includes('src-tauri/resources/theme-packs/zcode/runtime/** text eol=lf')) throw new Error('ZCode manifest or LF protection incomplete');
let checked = 0;
for (const target of ['cursor','grokbot']) {
  const base = path.join(root, 'src-tauri/resources/theme-packs', target, 'runtime');
  const entries = fs.readFileSync(path.join(base, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
  const expectedFiles = new Set(['SHA256SUMS.txt']);
  let assets = 0;
  for (const line of entries) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9._/-]+)$/.exec(line);
    if (!match || match[2].split('/').some(p => !p || p === '..' || p === '.')) throw new Error('Invalid runtime manifest');
    const [, hash, relative] = match;
    const shared = relative.startsWith('assets/');
    const file = path.join(shared ? path.join(root, 'theme-preview') : base, relative);
    const bytes = fs.readFileSync(file);
    if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error(`${target}: stale or tampered ${relative}`);
    if (shared) assets++;
    else {
      if (bytes.includes(13)) throw new Error(`${target}: expected LF-only ${relative}`);
      if (expectedFiles.has(relative)) throw new Error('Duplicate manifest entry');
      expectedFiles.add(relative);
      if (!source.includes(`../resources/theme-packs/${target}/runtime/${relative}`)) throw new Error('Missing compiled resource');
    }
    checked++;
  }
  function inspect(directory, prefix='') {
    for (const entry of fs.readdirSync(directory, { withFileTypes:true })) {
      const name = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error('Runtime link refused');
      if (entry.isDirectory()) inspect(path.join(directory,entry.name),name+'/');
      else if (!expectedFiles.delete(name)) throw new Error(`Unlisted runtime file: ${name}`);
    }
  }
  inspect(base);
  if (expectedFiles.size || assets !== 10) throw new Error('Incomplete package or shared artwork count');
  if (catalog.targets.find(t => t.id === target)?.bundlesAdapterRuntime !== true) throw new Error('Catalog contradicts bundled runtime');
}
const doubao = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/resources/theme-packs/doubao/extension/manifest.json'), 'utf8'));
if (!fs.readFileSync(path.join(root,'src-tauri/src/external_targets.rs'),'utf8').includes(`DOUBAO_THEME_VERSION: &str = "${doubao.version}"`)) throw new Error('Doubao version mismatch');
console.log(`Reviewed runtime integrity OK (${checked} Cursor/Grok + ${zcodeFiles} ZCode protected files; shared PNGs not duplicated).`);
