import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);

const executablePath = chromeCandidates.find((candidate) =>
  existsSync(candidate)
);

if (!executablePath) {
  throw new Error("Google Chrome was not found for launcher screenshot QA.");
}

const outputDirectory = resolve("artifacts");
const outputPath = resolve(
  outputDirectory,
  process.argv[2] || "diana-launcher-v0-dark.png"
);
const targetUrl = process.argv[3] || "http://127.0.0.1:1421/";
const requestedTheme = process.argv[4] || "dark";
const requestedTarget = process.argv[5] || "codex";
const requestedSelectorState = process.argv[6] || "expanded";
const browserMessages = [];

mkdirSync(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true
});

try {
  const page = await browser.newPage({
    viewport: { width: 636, height: 930 },
    deviceScaleFactor: 1,
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

  await page.goto(targetUrl, { waitUntil: "networkidle" });
  if (requestedTarget !== "codex") {
    await page
      .getByRole("combobox", { name: /选择要启动/ })
      .selectOption(requestedTarget);
  }
  if (requestedTheme === "light") {
    await page.getByRole("button", { name: "日间" }).click();
  } else if (requestedTheme === "system") {
    await page.getByRole("button", { name: "跟随系统" }).click();
  }
  if (requestedSelectorState === "collapsed") {
    await page
      .getByRole("button", { name: "隐藏目标应用列表" })
      .click();
    await page
      .locator('.launcher-stage[data-selector-state="collapsed"]')
      .waitFor();
    await page.locator(".selector-toggle").blur();
    await page.mouse.move(626, 920);
    await page.waitForFunction(() => {
      const hint = document.querySelector(".selector-collapse-hint");
      return hint instanceof HTMLElement &&
        Number(getComputedStyle(hint).opacity) > 0.99;
    });
  }
  await page.screenshot({
    path: outputPath,
    animations: "disabled",
    omitBackground: true
  });

  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight
  }));

  console.log(
    JSON.stringify(
      {
        outputPath,
        targetUrl,
        requestedTheme,
        requestedTarget,
        requestedSelectorState,
        metrics,
        browserMessages
      },
      null,
      2
    )
  );

  if (browserMessages.length > 0) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
