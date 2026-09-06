import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import worker from "../demo/worker.js";
const root = resolve("site-build/dist/client");
const mime = { ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".m4a": "audio/mp4", ".html": "text/html" };
const env = { ASSETS: { async fetch(request) {
  const file = resolve(root, "." + decodeURIComponent(new URL(request.url).pathname));
  if (!file.startsWith(root + sep)) return new Response(null, { status: 404 });
  try { return new Response(await readFile(file), { headers: { "Content-Type": mime[extname(file)] || "application/octet-stream" } }); }
  catch { return new Response(null, { status: 404 }); }
} } };
createServer(async (req, res) => {
  try {
    const response = await worker.fetch(new Request(`http://127.0.0.1:4175${req.url}`, { method: req.method }), env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end("Demo preview error"); }
}).listen(4175, "127.0.0.1", () => console.log("Demo Worker preview: http://127.0.0.1:4175/"));
