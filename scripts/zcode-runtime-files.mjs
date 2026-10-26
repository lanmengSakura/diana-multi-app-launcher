import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const directory = path.join(project, 'src-tauri/resources/theme-packs/zcode/runtime-3.16.3');
export const runtimeFiles = new Map(['adapter.mjs', 'rules.mjs', 'runtime-template.js', 'layout.css', 'README.md']
  .map(name => [name, path.join(directory, name)]));
runtimeFiles.set('theme.css', path.join(directory, '../runtime/theme.css'));
for (const name of ['LICENSE', 'ASSET_LICENSES.md']) runtimeFiles.set(name, path.join(project, name));
// Shared artwork is embedded once in the launcher, not copied into this source folder.
for (const name of fs.readdirSync(path.join(project, 'theme-preview/assets')).filter(name => name.endsWith('.png')).sort()) {
  runtimeFiles.set(`assets/${name}`, path.join(project, 'theme-preview/assets', name));
}
