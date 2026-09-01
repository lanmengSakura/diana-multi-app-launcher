import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));

if (!executablePath) {
  throw new Error("Google Chrome was not found for Diana ZCode theme preview QA.");
}

const outputDirectory = resolve("artifacts");
mkdirSync(outputDirectory, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true });
const results = [];

function parseHex(value) {
  const normalized = value.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
}

function luminance(rgb) {
  const converted = rgb.map((channel) => channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * converted[0] + 0.7152 * converted[1] + 0.0722 * converted[2];
}

function contrastRatio(foreground, background) {
  const foregroundRgb = parseHex(foreground);
  const backgroundRgb = parseHex(background);
  if (!foregroundRgb || !backgroundRgb) return null;
  const lighter = Math.max(luminance(foregroundRgb), luminance(backgroundRgb));
  const darker = Math.min(luminance(foregroundRgb), luminance(backgroundRgb));
  return (lighter + 0.05) / (darker + 0.05);
}

try {
  const viewports = [
    { name: "standard", width: 1200, height: 800 },
    { name: "wide", width: 2560, height: 1392 }
  ];

  for (const theme of ["dark", "light"]) {
    for (const viewport of viewports) {
    const browserMessages = [];
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      colorScheme: theme,
      reducedMotion: "reduce"
    });

    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error") {
        browserMessages.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => browserMessages.push(`pageerror: ${error.message}`));

    await page.goto(
      `http://127.0.0.1:1431/theme-preview/index.html?theme=${theme}&clean=1`,
      { waitUntil: "networkidle" }
    );
    await page.locator(`html[data-zcode-theme='${theme}']`).waitFor();

    const screenshotName = viewport.name === "standard"
      ? `zcode-theme-${theme}-preview.png`
      : `zcode-theme-${theme}-${viewport.name}-preview.png`;
    const screenshotPath = resolve(outputDirectory, screenshotName);
    await page.screenshot({ path: screenshotPath, animations: "disabled" });
    const sidebarHoverTarget = page.locator(".task-row").first();
    const sidebarHoverBefore = await sidebarHoverTarget.evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage, borderColor: style.borderColor };
    });
    await sidebarHoverTarget.hover();
    await page.waitForTimeout(180);
    const sidebarHoverAfter = await sidebarHoverTarget.evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage, borderColor: style.borderColor };
    });
    const railTarget = page.locator(".diana-zcode-message-rail > button").nth(13);
    const railWaveBefore = await page.evaluate(() => [11, 12, 13, 14, 15].map((index) => {
      const line = document.querySelector(`.diana-zcode-message-rail > button:nth-child(${index + 1}) > span`);
      return line?.getBoundingClientRect().width || 0;
    }));
    await railTarget.hover();
    await page.waitForTimeout(180);
    const railWaveAfter = await page.evaluate(() => [11, 12, 13, 14, 15].map((index) => {
      const line = document.querySelector(`.diana-zcode-message-rail > button:nth-child(${index + 1}) > span`);
      return line?.getBoundingClientRect().width || 0;
    }));
    await railTarget.click();

    const metrics = await page.evaluate(({ railWaveBefore, railWaveAfter, sidebarHoverBefore, sidebarHoverAfter }) => {
      const style = getComputedStyle(document.documentElement);
      const interactiveElements = [...document.querySelectorAll("button, textarea")];
      const chrome = document.querySelector("#diana-zcode-chrome");
      const rail = document.querySelector(".diana-zcode-message-rail");
      const railButtons = rail ? [...rail.querySelectorAll(":scope > button")] : [];
      const railLines = railButtons.map((button) => button.querySelector(":scope > span")).filter(Boolean);
      const railBefore = rail ? getComputedStyle(rail, "::before") : null;
      const railAfter = rail ? getComputedStyle(rail, "::after") : null;
      const sidebar = document.querySelector(".sidebar");
      const sidebarAfter = sidebar ? getComputedStyle(sidebar, "::after") : null;
      const activeView = document.querySelector(".view-switch .is-active");
      const selectedTask = document.querySelector(".task-row.is-selected");
      const selectedTaskBefore = selectedTask ? getComputedStyle(selectedTask, "::before") : null;
      return {
        viewport: [window.innerWidth, window.innerHeight],
        scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        theme: document.documentElement.dataset.zcodeTheme,
        ink: style.getPropertyValue("--diana-ink").trim(),
        surface: style.getPropertyValue("--diana-surface").trim(),
        muted: style.getPropertyValue("--diana-muted").trim(),
        pointerSafe: chrome ? getComputedStyle(chrome).pointerEvents === "none" : false,
        unlabeledButtons: interactiveElements.filter((element) => {
          if (element.tagName !== "BUTTON") return false;
          return !element.textContent.trim() && !element.getAttribute("aria-label");
        }).length,
        composer: document.querySelector(".composer")?.getBoundingClientRect().toJSON(),
        cards: document.querySelector(".starter-cards")?.getBoundingClientRect().toJSON(),
        sidebar: {
          width: sidebar?.getBoundingClientRect().width || 0,
          after: sidebarAfter ? { content: sidebarAfter.content, width: sidebarAfter.width } : null,
          activeViewBackground: activeView ? getComputedStyle(activeView).backgroundImage : "none",
          selectedTaskBackground: selectedTask ? getComputedStyle(selectedTask).backgroundImage : "none",
          selectedTaskMarker: selectedTaskBefore ? { content: selectedTaskBefore.content, width: selectedTaskBefore.width, height: selectedTaskBefore.height } : null,
          hoverBefore: sidebarHoverBefore,
          hoverAfter: sidebarHoverAfter
        },
        rail: {
          count: railButtons.length,
          profile: rail?.dataset.dianaRailProfile,
          majorCount: railButtons.filter((button) => button.dataset.dianaRailMajor === "true").length,
          currentCount: railButtons.filter((button) => button.dataset.dianaViewportCurrent === "true").length,
          currentIndex: railButtons.findIndex((button) => button.dataset.dianaViewportCurrent === "true"),
          uniqueScales: new Set(railButtons.map((button) => button.style.getPropertyValue("--diana-art-scale"))).size,
          lineHeights: [...new Set(railLines.map((line) => getComputedStyle(line).height))],
          before: railBefore ? { content: railBefore.content, width: railBefore.width, height: railBefore.height } : null,
          after: railAfter ? { content: railAfter.content, width: railAfter.width, height: railAfter.height } : null,
          waveBefore: railWaveBefore,
          waveAfter: railWaveAfter
        }
      };
    }, { railWaveBefore, railWaveAfter, sidebarHoverBefore, sidebarHoverAfter });

    const densityMetrics = await page.evaluate((counts) => counts.map((count) => {
      const rail = window.__DIANA_ZCODE_PREVIEW_RAIL__.render(count);
      const buttons = [...rail.querySelectorAll(":scope > button")];
      const lines = buttons.map((button) => button.querySelector(":scope > span"));
      return {
        count,
        renderedCount: buttons.length,
        profile: rail.dataset.dianaRailProfile,
        majorCount: buttons.filter((button) => button.dataset.dianaRailMajor === "true").length,
        currentCount: buttons.filter((button) => button.dataset.dianaViewportCurrent === "true").length,
        currentIndex: buttons.findIndex((button) => button.dataset.dianaViewportCurrent === "true"),
        uniqueScales: new Set(buttons.map((button) => button.style.getPropertyValue("--diana-art-scale"))).size,
        lineHeights: [...new Set(lines.map((line) => getComputedStyle(line).height))]
      };
    }), [12, 50, 100, 220]);

    const contrast = {
      ink: contrastRatio(metrics.ink, metrics.surface),
      muted: contrastRatio(metrics.muted, metrics.surface)
    };
    const overflowFree = metrics.scroll[0] === metrics.viewport[0] && metrics.scroll[1] === metrics.viewport[1];
    const passed = overflowFree
      && metrics.pointerSafe
      && metrics.unlabeledButtons === 0
      && metrics.sidebar.width === 265
      && metrics.sidebar.after?.content !== "none"
      && metrics.sidebar.after?.width === "1px"
      && metrics.sidebar.activeViewBackground !== "none"
      && metrics.sidebar.selectedTaskBackground !== "none"
      && metrics.sidebar.selectedTaskMarker?.content !== "none"
      && metrics.sidebar.selectedTaskMarker?.height === "14px"
      && JSON.stringify(metrics.sidebar.hoverAfter) !== JSON.stringify(metrics.sidebar.hoverBefore)
      && metrics.rail.count === 91
      && metrics.rail.profile === "balanced"
      && metrics.rail.majorCount === 19
      && metrics.rail.currentCount === 1
      && metrics.rail.currentIndex === 13
      && metrics.rail.uniqueScales >= 8
      && metrics.rail.lineHeights.length === 1
      && metrics.rail.lineHeights[0] === "2px"
      && metrics.rail.before?.content !== "none"
      && metrics.rail.after?.content !== "none"
      && metrics.rail.waveAfter[2] >= 31
      && metrics.rail.waveAfter[1] >= 20
      && metrics.rail.waveAfter[3] >= 20
      && metrics.rail.waveAfter[0] >= 15
      && metrics.rail.waveAfter[4] >= 15
      && metrics.rail.waveAfter.every((width, index) => width > metrics.rail.waveBefore[index])
      && densityMetrics.every((rail) => rail.renderedCount === rail.count
        && rail.profile === (rail.count <= 32 ? "sparse" : rail.count <= 96 ? "balanced" : "dense")
        && rail.majorCount === Math.floor((rail.count - 1) / 5) + 1
        && rail.currentCount === 1
        && rail.currentIndex === rail.count - 1
        && rail.uniqueScales >= Math.min(rail.count, 6)
        && rail.lineHeights.length === 1
        && rail.lineHeights[0] === "2px")
      && contrast.ink >= 7
      && contrast.muted >= 4.3
      && browserMessages.length === 0;

    results.push({ theme, viewport: viewport.name, screenshotPath, metrics, densityMetrics, contrast, overflowFree, browserMessages, passed });
    await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.passed)) process.exitCode = 1;
