import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const source = read('demo/theme-art.ts');
const catalog = read('demo/theme-catalog.ts');
assert.equal([...catalog.matchAll(/\{ id: '/g)].length, 7, 'Seven non-Codex targets');
assert.match(catalog, /id: 'terminal'[^\n]+day: false/);
assert.match(read('demo/themes.tsx'), /lanmengsakura\.github\.io\/diana-codex-theme\//);
const assetImports = [...source.matchAll(/import \w+ from '([^']+\.png)'/g)].map(match => match[1]);
assert.equal(new Set(assetImports).size, 11, 'One shared ten-piece collection plus Terminal composite');
for (const path of assetImports) assert.ok(existsSync(resolve(root, 'demo', path)), path);
for (const name of ['cursor', 'grok']) {
  const css = read(`demo/theme-sources/${name}.css`);
  for (const [placeholder] of css.matchAll(/__[A-Z_]+__/g)) assert.ok(source.includes(`${placeholder}:`), `Missing ${placeholder}`);
  const canonical = createHash('sha256').update(css.replace(/\r\n/g, '\n')).digest('hex');
  console.log(`${name} CSS SHA-256 (LF): ${canonical}`);
}
const output = resolve(root, 'site-build/dist/client');
let assetRefs = 0;
for (const name of readdirSync(output).filter(name => name.endsWith('.page'))) {
  const html = readFileSync(resolve(output, name), 'utf8');
  for (const [, url] of html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)(?:[^" ]*)"/g)) {
    assert.ok(existsSync(output + url), `Missing HTML asset ${url}`); assetRefs++;
  }
}
for (const name of readdirSync(resolve(output, 'assets')).filter(name => name.endsWith('.js'))) {
  const js = readFileSync(resolve(output, 'assets', name), 'utf8');
  for (const [url] of js.matchAll(/\/assets\/[a-zA-Z0-9_-]+\.(?:png|woff2|webp)/g)) assert.ok(existsSync(output + url), `Missing bundle asset ${url}`);
  assert.doesNotMatch(js, /AppData[\\/]|DianaCursorTheme|DianaGrokBotTheme|localhost:3080|闪修侠|语兴数据|Fantasy_Adventure/);
}
for (const name of ['_diana-shell.page', '_diana-launcher.page', '_diana-themes.page', '_diana-theme-app.page']) assert.ok(existsSync(resolve(output, name)));
for (const name of ['index.html', 'launcher.html', 'themes.html', 'theme-app.html']) assert.ok(!existsSync(resolve(output, name)), 'HTML must pass through nonce Worker');
assert.ok(existsSync(resolve(output, 'media/hopeful-dreamer.m4a')), 'Preserve previously approved launcher audio');
console.log(`PASS: 7 targets, 11 shared assets, ${assetRefs} HTML asset references, four Worker pages; no browser launched.`);
