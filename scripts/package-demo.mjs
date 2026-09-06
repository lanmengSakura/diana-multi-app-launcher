import { copyFileSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
// Separate build root: a web build must never overwrite Tauri's native dist.
const root = new URL("../site-build/", import.meta.url);
mkdirSync(new URL("dist/server/", root), { recursive: true });
mkdirSync(new URL(".openai/", root), { recursive: true });
copyFileSync(new URL("../demo/worker.js", import.meta.url), new URL("dist/server/index.js", root));
copyFileSync(new URL("../.openai/hosting.json", import.meta.url), new URL(".openai/hosting.json", root));
writeFileSync(new URL("dist/server/wrangler.json", root), JSON.stringify({
  name: "diana-launcher-demo", main: "index.js", compatibility_date: "2026-09-01",
  assets: { directory: "../client", binding: "ASSETS", html_handling: "auto-trailing-slash", not_found_handling: "404-page", run_worker_first: ["/", "/index.html", "/launcher", "/launcher.html", "/launcher/"] }
}, null, 2));
for (const file of ["dist/client/index.html", "dist/client/launcher.html", "dist/server/index.js", ".openai/hosting.json"]) {
  if (!readFileSync(new URL(file, root)).length) throw new Error(`Missing demo output: ${file}`);
}
console.log("Demo built in site-build/dist; native dist preserved.");
