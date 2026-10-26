import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const source = join(root, "plugins/diana-deepseek-desktop");
const output = join(root, "src-tauri/resources/theme-packs/deepseek/desktop-plugin");
const blueprint = await readFile(join(root, "src-tauri/resources/theme-packs/deepseek/diana.css"), "utf8");
const palettes = [...blueprint.matchAll(/body(?:\[data-ds-dark-theme\])?\s*\{([^}]+)\}/g)].slice(0, 2);
if (palettes.length !== 2) throw new Error("Missing approved day/night palettes");
const tokens = {};
let css = "";
for (const [index, match] of palettes.entries()) {
  const mode = index === 0 ? "light" : "dark";
  const custom = [];
  for (const declaration of match[1].split(";")) {
    const parsed = declaration.trim().match(/^(--[\w-]+)\s*:\s*([\s\S]+)$/);
    if (!parsed) continue;
    const [, name, value] = parsed;
    if (name.startsWith("--dsw-")) (tokens[name] ??= {})[mode] = value.trim();
    else custom.push(`${name}:${value.trim()};`);
  }
  css += `body.diana-dsh-host${index ? "[data-ds-dark-theme]" : ""}{${custom.join("")}}\n`;
}
for (const [name, pair] of Object.entries(tokens)) {
  if (!pair.light || !pair.dark) throw new Error(`Incomplete palette pair: ${name}`);
}
// Keep the established artwork geometry and responsive sizes verbatim. Only
// replace the old web-shell anchors with the verified Desktop conversation host.
let artwork = blueprint.slice(blueprint.indexOf("/* The top ornaments"), blueprint.indexOf("/* Harness places its functional turn navigator"))
  + blueprint.slice(blueprint.indexOf("body:has([data-slot='conversation.view']) [data-shell-overlay]::before"), blueprint.indexOf("@media (prefers-reduced-motion"));
if (!artwork.includes("--diana-session-character-size")) throw new Error("Approved artwork sections changed; re-check layout mapping");
artwork = artwork
  .replaceAll("body:has([data-slot='conversation.view'])::before", ".diana-dsh-surface[data-phase='active'] .diana-dsh-lines")
  .replaceAll("body:has([data-slot='conversation.view'])", ".diana-dsh-surface[data-phase='active']")
  .replaceAll("body:not([data-ds-dark-theme])", "body.diana-dsh-host:not([data-ds-dark-theme])")
  .replaceAll("body::before", ".diana-dsh-lines")
  .replaceAll("[data-shell-overlay]::before", ".diana-dsh-portrait")
  .replaceAll("[data-shell-overlay]::after", ".diana-dsh-doodle")
  .replaceAll("[data-shell-overlay]", ".diana-dsh-art")
  .replaceAll("body {", ".diana-dsh-art {")
  .replaceAll("position: fixed;", "position: absolute;")
  .replaceAll("z-index: 19;", "z-index: 0;");
css += artwork + "\n" + await readFile(join(source, "artwork.css"), "utf8");
const assetNames = [...new Set([...css.matchAll(/(?:asset:|\/diana-brand\/)([^'"()]+\.png)/g)].map(m => m[1]))];
for (const name of assetNames) {
  const path = resolve(root, "theme-preview/assets", name);
  if (!path.startsWith(resolve(root, "theme-preview/assets") + "/") && !path.startsWith(resolve(root, "theme-preview/assets") + "\\")) throw new Error("Invalid asset path");
  const bytes = await readFile(path);
  const url = `data:image/png;base64,${bytes.toString("base64")}`;
  css = css.replaceAll(`asset:${name}`, url).replaceAll(`/diana-brand/${name}`, url);
}
const client = (await readFile(join(source, "client-template.js"), "utf8"))
  .replace("__DIANA_PLUGIN_PAYLOAD__", JSON.stringify({css, tokens}));
await mkdir(output, {recursive: true});
for (const name of ["package.json", "index.js", "cordis.patch.yml", "README.md"]) await copyFile(join(source, name), join(output, name));
for (const name of ["LICENSE", "ASSET_LICENSES.md"]) await copyFile(join(root, name), join(output, name));
await writeFile(join(output, "client.js"), client);
console.log(JSON.stringify({output, tokenPairs: Object.keys(tokens).length, assets: assetNames.length, clientBytes: Buffer.byteLength(client)}));
