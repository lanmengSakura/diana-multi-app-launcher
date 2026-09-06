import { existsSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
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
    colorScheme: "dark",
    reducedMotion: "no-preference"
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
    const NativeAudio = window.Audio;
    window.Audio = class extends NativeAudio {
      constructor(...args) {
        super(...args);
        window.__musicQaAudio = this;
      }
    };
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
  await page.addStyleTag({ content: 'html, body { background: #0d0c0f !important; }' });

  const button = page.locator(".music-toggle");
  await button.waitFor();
  await page.waitForFunction(
    () => document.querySelector(".music-toggle")?.getAttribute("data-state") === "ready"
  );

  const notes = button.locator('.music-toggle__note');
  assert.equal(await notes.count(), 3);
  const notesLayer = button.locator('.music-toggle__notes');
  assert.equal(await notesLayer.getAttribute('aria-hidden'), 'true');
  assert.equal(await notesLayer.evaluate(node => getComputedStyle(node).pointerEvents), 'none');
  const noteStates = () => notes.evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    const matrix = new DOMMatrixReadOnly(style.transform);
    const bounds = node.getBoundingClientRect();
    return {
      animation: style.animationName, opacity: Number(style.opacity),
      transform: style.transform, x: matrix.m41, y: matrix.m42,
      display: style.display, duration: style.animationDuration,
      iterations: style.animationIterationCount,
      bounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom }
    };
  }));
  mkdirSync("artifacts", { recursive: true });
  const results = [];
  for (const reducedMotion of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion });
    assert.equal(await notesLayer.evaluate(node => getComputedStyle(node).opacity), '0');
    await button.click();
    await page.waitForFunction(() => document.querySelector('.music-toggle')?.dataset.state === 'playing');
    await page.mouse.move(270, 540);
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    assert.equal(await notes.count(), 3, 'Resume must not duplicate the plume');
    assert.notEqual(await notesLayer.evaluate(node => getComputedStyle(node).display), 'none');
    const active = (await noteStates()).filter(note => note.display !== 'none');
    assert.equal(active.length, reducedMotion === 'reduce' ? 2 : 3);
    assert.ok(active.every(note => note.animation === 'diana-music-note-float'
      && note.iterations === 'infinite' && note.duration === (reducedMotion === 'reduce' ? '4.8s' : '3.6s')));
    await page.waitForTimeout(750);
    const firstFrame = await noteStates();
    assert.ok(firstFrame.some(note => note.opacity > 0.3));
    await page.screenshot({ path: `artifacts/diana-music-${reducedMotion}-1.png`, clip: { x: 403, y: 98, width: 108, height: 73 } });
    await page.waitForTimeout(1200);
    const secondFrame = await noteStates();
    assert.ok(secondFrame[0].x > firstFrame[0].x + 5, 'The note must move outward');
    assert.ok(secondFrame[0].y < firstFrame[0].y, 'The note must rise');
    assert.ok(secondFrame.some(note => note.opacity > 0.3));
    await page.screenshot({ path: `artifacts/diana-music-${reducedMotion}-2.png`, clip: { x: 403, y: 98, width: 108, height: 73 } });
    // Sample one complete staggered cycle, including the outgoing fade. The
    // stream must stay away from the window controls and keep hit testing clear.
    const pathSamples = await notes.evaluateAll(nodes => nodes.flatMap(node => {
      if (getComputedStyle(node).display === 'none') return [];
      const animation = node.getAnimations()[0];
      const timing = animation.effect.getTiming();
      animation.pause();
      const samples = [0.14, 0.48, 0.66, 0.82].map(phase => {
        animation.currentTime = Number(timing.delay) + Number(timing.duration) * phase;
        const bounds = node.getBoundingClientRect();
        return { phase, opacity: Number(getComputedStyle(node).opacity),
          top: bounds.top, right: bounds.right,
          intercepts: node.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)) };
      });
      animation.currentTime = Number(timing.delay) + Number(timing.duration) * 0.35;
      animation.play();
      return samples;
    }));
    assert.ok(pathSamples.every(sample => sample.top > 93 && sample.right < 510 && !sample.intercepts));
    assert.ok(pathSamples.filter(sample => sample.phase === 0.82).every(sample => sample.opacity < 0.01));
    await page.waitForTimeout(600);
    await page.screenshot({ path: `artifacts/diana-launcher-music-playing-${reducedMotion}.png` });
    await button.click();
    await page.waitForFunction(() => document.querySelector('.music-toggle')?.dataset.state === 'paused');
    await page.mouse.move(270, 540);
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    const pausedNotes = await noteStates();
    assert.ok(pausedNotes.every(note => note.animation === 'none' && note.opacity === 0));
    assert.equal(await notesLayer.evaluate(node => getComputedStyle(node).opacity), '0');
    assert.equal(await page.evaluate(() => window.__musicQaAudio.paused), true);
    results.push({ reducedMotion, activeParticles: active.length, visiblyDrifting: true, fadeOut: true, stoppedOnPause: true });
  }

  // Playback failure also removes the plume instead of leaving frozen notes.
  await button.click();
  await page.waitForFunction(() => document.querySelector('.music-toggle')?.dataset.state === 'playing');
  await page.evaluate(() => window.__musicQaAudio.onerror(new Event('error')));
  await page.waitForFunction(() => document.querySelector('.music-toggle')?.dataset.state === 'error');
  assert.equal(await notesLayer.evaluate(node => getComputedStyle(node).opacity), '0');
  assert.ok((await noteStates()).every(note => note.animation === 'none' && note.opacity === 0));
  assert.deepEqual(browserMessages, []);

  console.log(
    JSON.stringify(
      {
        trackReady: (await button.getAttribute("data-track-ready")) === "true",
        floatingNotes: results,
        errorClearsParticles: true,
        finalState: await button.getAttribute("data-state"),
        screenshot: "artifacts/diana-launcher-music-playing-reduce.png",
        browserMessages
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
