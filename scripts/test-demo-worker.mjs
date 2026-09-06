import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../demo/worker.js";
const html = '<html><meta http-equiv="Content-Security-Policy" content="script-src self"><script type="module" src="/assets/app.js"></script></html>';
const env = { ASSETS: { fetch: async () => new Response(html, { headers: { "Content-Type": "text/html", "ETag": "fixture" } }) } };
test("per-response CSP nonce supports hosting checks without unsafe-inline scripts", async () => {
  const first = await worker.fetch(new Request("https://example.test/"), env);
  const second = await worker.fetch(new Request("https://example.test/"), env);
  const policy = first.headers.get("Content-Security-Policy");
  assert.match(policy, /script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(policy.split(";").find(part => part.includes("script-src")), /unsafe-inline/);
  assert.notEqual(policy, second.headers.get("Content-Security-Policy"));
  assert.equal(first.headers.get("Cache-Control"), "private, no-store");
  assert.equal(first.headers.get("ETag"), null);
  const body = await first.text();
  assert.doesNotMatch(body, /http-equiv="Content-Security-Policy"/);
  assert.match(body, /src="\/assets\/app.js"/);
});
test("static assets are preserved and writes are refused", async () => {
  const assets = { ASSETS: { fetch: async () => new Response("body{}", { headers: { "Content-Type": "text/css" } }) } };
  const css = await worker.fetch(new Request("https://example.test/a.css"), assets);
  assert.equal(await css.text(), "body{}");
  assert.equal(css.headers.get("Content-Security-Policy"), null);
  assert.equal((await worker.fetch(new Request("https://example.test/", { method: "POST" }), env)).status, 405);
});
test("public HTML routes map to internal pages before applying the nonce", async () => {
  const seen = [];
  const assets = { ASSETS: { fetch: async request => { seen.push(new URL(request.url).pathname); return new Response(html); } } };
  for (const path of ["/", "/launcher.html", "/themes", "/themes.html", "/theme-app.html", "/theme-app/", "/codex", "/codex.html", "/codex/"]) {
    const response = await worker.fetch(new Request("https://example.test" + path), assets);
    assert.match(response.headers.get("Content-Type"), /text\/html/);
    assert.match(response.headers.get("Content-Security-Policy"), /nonce-/);
  }
  assert.deepEqual(seen, ["/_diana-shell.page", "/_diana-launcher.page", "/_diana-themes.page", "/_diana-themes.page", "/_diana-theme-app.page", "/_diana-theme-app.page", "/_diana-codex.page", "/_diana-codex.page", "/_diana-codex.page"]);
});
