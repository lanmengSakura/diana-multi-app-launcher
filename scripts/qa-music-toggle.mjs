import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));

if (!executablePath) {
  throw new Error("Google Chrome was not found for launcher music QA.");
}

const browserMessages = [];
const browser = await chromium.launch({ executablePath, headless: true });

try {
  const page = await browser.newPage({
    viewport: { width: 636, height: 930 },
    colorScheme: "dark"
  });

  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      browserMessages.push(message.type() + ": " + message.text());
    }
  });
  page.on("pageerror", (error) => {
    browserMessages.push("pageerror: " + error.message);
  });

  await page.addInitScript(() => {
    const makeSilentWav = () => {
      const sampleRate = 8000;
      const sampleCount = 8000;
      const buffer = new ArrayBuffer(44 + sampleCount);
      const view = new DataView(buffer);
      const writeAscii = (offset, text) => {
        for (let index = 0; index < text.length; index += 1) {
          view.setUint8(offset + index, text.charCodeAt(index));
        }
      };
      writeAscii(0, "RIFF");
      view.setUint32(4, 36 + sampleCount, true);
      writeAscii(8, "WAVE");
      writeAscii(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate, true);
      view.setUint16(32, 1, true);
      view.setUint16(34, 8, true);
      writeAscii(36, "data");
      view.setUint32(40, sampleCount, true);
      new Uint8Array(buffer, 44).fill(128);
      return buffer;
    };

    const launcherStatus = {
      stage: "ready",
      codexRunning: false,
      themeChannelConnected: false,
      processCount: 0,
      mainProcessId: null,
      codexVersion: "qa",
      codexPath: null,
      activeThemeMode: null,
      debugPort: null,
      runtimeRoot: null,
      compatibilityMode: "runtime_probe",
      runtimeAvailable: true,
      nativeAppearanceManaged: false,
      actionRequired: null,
      message: "Music QA"
    };

    window.__TAURI_INTERNALS__ = {
      invoke: async (command) => {
        if (command === "get_launcher_status") return launcherStatus;
        if (command === "get_music_track_status") {
          return {
            available: true,
            fileName: "Hopeful Dreamer.wav",
            mimeType: "audio/wav",
            sizeBytes: 8044,
            issue: null
          };
        }
        if (command === "load_music_track") return makeSilentWav();
        if (command === "quit_launcher") {
          return null;
        }
        throw new Error(`Unexpected mock command: ${command}`);
      }
    };
  });

  await page.goto("http://127.0.0.1:1421/", { waitUntil: "networkidle" });

  const button = page.locator(".music-toggle");
  await button.waitFor();
  await page.waitForFunction(
    () => document.querySelector(".music-toggle")?.getAttribute("data-state") === "ready"
  );

  await button.click();
  await page.waitForFunction(
    () => document.querySelector(".music-toggle")?.getAttribute("data-state") === "playing"
  );
  const playingPressed = (await button.getAttribute("aria-pressed")) === "true";
  mkdirSync("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/diana-launcher-music-playing.png",
    omitBackground: true
  });

  await button.click();
  await page.waitForFunction(
    () => document.querySelector(".music-toggle")?.getAttribute("data-state") === "paused"
  );
  const pausedPressed = (await button.getAttribute("aria-pressed")) === "false";

  if (!playingPressed || !pausedPressed || browserMessages.length > 0) {
    throw new Error(
      JSON.stringify({ playingPressed, pausedPressed, browserMessages }, null, 2)
    );
  }

  console.log(
    JSON.stringify(
      {
        trackReady: (await button.getAttribute("data-track-ready")) === "true",
        playingPressed,
        pausedPressed,
        finalState: await button.getAttribute("data-state"),
        screenshot: "artifacts/diana-launcher-music-playing.png",
        browserMessages
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
