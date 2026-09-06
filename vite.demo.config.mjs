import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Optional, build-time media only. Never expose the source path to the browser.
const music = process.env.DIANA_HOPEFUL_DREAMER_AUDIO
  ? readFileSync(process.env.DIANA_HOPEFUL_DREAMER_AUDIO) : null;
if (music && (music.length === 0 || music.length > 8 * 1024 * 1024)) {
  throw new Error("Demo music must be a nonempty M4A smaller than 8 MiB.");
}

export default defineConfig({
  root: "demo",
  publicDir: "../public",
  plugins: [react(), {
    name: "approved-demo-music",
    configureServer(server) {
      server.middlewares.use("/media/hopeful-dreamer.m4a", (_req, res) => {
        if (!music) { res.statusCode = 404; res.end(); return; }
        res.setHeader("Content-Type", "audio/mp4");
        res.end(music);
      });
    },
    generateBundle() {
      if (music) this.emitFile({ type: "asset", fileName: "media/hopeful-dreamer.m4a", source: music });
    }
  }],
  define: { __DEMO_MUSIC_BYTES__: JSON.stringify(music?.length ?? 0) },
  server: { host: "127.0.0.1", port: 1422, strictPort: true },
  build: {
    outDir: "../site-build/dist/client",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    rolldownOptions: { input: { index: resolve("demo/index.html"), launcher: resolve("demo/launcher.html") } }
  }
});
