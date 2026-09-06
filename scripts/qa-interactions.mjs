import { existsSync } from "node:fs";
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
  throw new Error("Google Chrome was not found for launcher interaction QA.");
}

const browserMessages = [];
const browser = await chromium.launch({ executablePath, headless: true });

try {
  const page = await browser.newPage({
    viewport: { width: 540, height: 930 },
    colorScheme: "dark",
    reducedMotion: "reduce"
  });

  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      browserMessages.push(message.type() + ": " + message.text());
    }
  });
  page.on("pageerror", (error) => {
    browserMessages.push("pageerror: " + error.message);
  });

  await page.goto("http://127.0.0.1:1421/", { waitUntil: "networkidle" });

  const selectorAssemblyReady = await page
    .locator(".target-assembly-art")
    .evaluate((image) =>
      image instanceof HTMLImageElement &&
      image.complete &&
      image.naturalWidth > 0 &&
      image.naturalHeight > 0 &&
      getComputedStyle(image).pointerEvents === "none"
    );

  const selectorToggle = page.getByRole("button", {
    name: "隐藏目标应用列表"
  });
  const selectorInitiallyExpanded =
    (await selectorToggle.getAttribute("aria-expanded")) === "true";
  await selectorToggle.click();
  await page
    .locator('.launcher-stage[data-selector-state="collapsed"]')
    .waitFor();
  const collapsedTargetSelect = page.locator("#target-app-dock select");
  await page.waitForFunction(() => {
    const anchor = document.querySelector(".target-anchor-art");
    const hint = document.querySelector(".selector-collapse-hint");
    return anchor instanceof HTMLElement &&
      hint instanceof HTMLElement &&
      Number(getComputedStyle(anchor).opacity) > 0.99 &&
      Number(getComputedStyle(hint).opacity) > 0.99;
  });
  const anchorBounds = await page.locator(".target-anchor-art").boundingBox();
  const selectorCollapsed =
    (await page.locator("#target-app-dock").getAttribute("aria-hidden")) ===
      "true" &&
    (await collapsedTargetSelect.isDisabled()) &&
    anchorBounds !== null &&
    Math.abs(anchorBounds.width - anchorBounds.height) < 0.1 &&
    (await page.locator(".target-anchor-art").evaluate((image) =>
      Number(getComputedStyle(image).opacity) > 0
    ));
  await page
    .getByRole("button", { name: "展开目标应用列表" })
    .click();
  await page
    .locator('.launcher-stage[data-selector-state="expanded"]')
    .waitFor();
  const selectorReexpanded =
    (await page.locator("#target-app-dock").getAttribute("aria-hidden")) ===
      "false" &&
    (await collapsedTargetSelect.isEnabled());

  await page.getByRole("button", { name: "日间" }).click();
  await page.locator("html[data-target-theme='light']").waitFor();

  await page.getByRole("button", { name: /启动并挂载/ }).click();
  await page
    .getByText("浏览器预览无法读取本机 Codex；未执行启动或挂载操作。")
    .waitFor();

  await page.getByRole("button", { name: "原版启动" }).click();
  await page
    .getByText("浏览器预览没有真实改动，因此没有需要恢复的内容。")
    .waitFor();

  const targetSelect = page.getByRole("combobox", { name: /选择要启动/ });
  const externalTargets = [
    { value: "doubao", shortLabel: "豆包", heading: "跟随豆包外观" },
    { value: "terminal", shortLabel: "终端", heading: "专属暗夜终端" },
    { value: "vscode", shortLabel: "VS Code", heading: "日间" },
    { value: "cursor", shortLabel: "Cursor", heading: "日间" },
    { value: "grokbot", shortLabel: "Grok Bot", heading: "日间" },
    { value: "deepseek", shortLabel: "Harness", heading: "跟随 Harness 外观" },
    { value: "zcode", shortLabel: "ZCode", heading: "选择 ZCode 挂载主题" }
  ];
  const externalChecks = [];
  for (const target of externalTargets) {
    await targetSelect.selectOption(target.value);
    await page
      .locator(`.launcher-stage[data-selected-target="${target.value}"]`)
      .waitFor();
    await page.getByText(target.heading, { exact: true }).first().waitFor();
    const primary = page.locator(".primary-action");
    const enabled = await primary.isEnabled();
    await primary.click();
    await page
      .getByText(
        `浏览器预览不会启动${target.shortLabel}；桌面 EXE 才会执行本机检测与安全部署。`
      )
      .waitFor();
    const expectedSecondary = {
      doubao: "原版启动", terminal: "原版启动", vscode: "切回原版",
      cursor: "切回原版", grokbot: "切回原版", deepseek: "打开页面", zcode: "切回原版"
    }[target.value];
    const secondary = page.locator(".secondary-action");
    const secondaryReadable = await secondary.locator("span").evaluate(node => {
      const style = getComputedStyle(node);
      return style.color !== "rgba(0, 0, 0, 0)" && style.visibility === "visible" && Number(style.opacity) > 0;
    });
    externalChecks.push({ target: target.value, enabled,
      secondaryCorrect: (await secondary.innerText()).trim() === expectedSecondary && secondaryReadable });
  }
  const targetOptionCount = await targetSelect.locator("option").count();
  await targetSelect.selectOption("cursor");
  const cursorMountPriority =
    (await page.locator(".primary-action").innerText()).includes("挂载并启动 Diana") &&
    (await page.getByText("完整美术待当前版本验证", { exact: false }).count()) === 0;
  await targetSelect.selectOption("grokbot");
  const grokMountPriority =
    (await page.locator(".primary-action").innerText()).includes("挂载并启动 Diana") &&
    (await page.getByText("完整 Diana 日夜美术", { exact: false }).count()) > 0;
  await targetSelect.selectOption("zcode");
  const zcodeMountPriority =
    (await page.locator(".primary-action").innerText()).includes("挂载并启动 Diana") &&
    (await page.getByText("安全启动 + 视觉蓝图", { exact: true }).count()) === 0 &&
    (await page.getByText("视觉蓝图 · 已内置", { exact: true }).count()) === 0;
  await targetSelect.selectOption("codex");
  await page.getByRole("button", { name: "日间" }).waitFor();

  const dynamicLabelVisible = await page.evaluate(() => {
    const stage = document.querySelector(".launcher-stage");
    const button = document.querySelector(".primary-action");
    const label = document.querySelector(".primary-label");
    if (!(stage instanceof HTMLElement) ||
        !(button instanceof HTMLButtonElement) ||
        !(label instanceof HTMLElement)) {
      return false;
    }

    stage.classList.add("phase-error");
    label.textContent = "退出 Codex 后挂载";
    const style = getComputedStyle(label);
    const visible =
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) > 0 &&
      style.color !== "rgba(0, 0, 0, 0)";
    stage.classList.remove("phase-error");
    return visible;
  });

  const result = {
    theme: await page.locator("html").getAttribute("data-target-theme"),
    primaryEnabled: await page
      .getByRole("button", { name: /启动并挂载/ })
      .isEnabled(),
    restoreEnabled: await page
      .getByRole("button", { name: "原版启动" })
      .isEnabled(),
    externalChecks,
    targetOptionCount,
    selectedTarget: await targetSelect.inputValue(),
    dynamicLabelVisible,
    selectorAssemblyReady,
    selectorInitiallyExpanded,
    selectorCollapsed,
    selectorReexpanded,
    cursorMountPriority,
    grokMountPriority,
    zcodeMountPriority,
    browserMessages
  };

  console.log(JSON.stringify(result, null, 2));
  if (
    result.theme !== "light" ||
    !result.primaryEnabled ||
    !result.restoreEnabled ||
    result.externalChecks.length !== externalTargets.length ||
    result.externalChecks.some((check) => !check.enabled || !check.secondaryCorrect) ||
    result.targetOptionCount !== 8 ||
    result.selectedTarget !== "codex" ||
    !result.dynamicLabelVisible ||
    !result.selectorAssemblyReady ||
    !result.selectorInitiallyExpanded ||
    !result.selectorCollapsed ||
    !result.selectorReexpanded ||
    !result.cursorMountPriority ||
    !result.grokMountPriority ||
    !result.zcodeMountPriority ||
    browserMessages.length > 0
  ) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
