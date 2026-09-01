(() => {
  "use strict";

  if (document.getElementById("diana-doubao-browser-stage")) {
    return;
  }

  const assetUrl = (name) => chrome.runtime.getURL(`assets/${name}`);
  const stage = document.createElement("div");
  stage.id = "diana-doubao-browser-stage";
  stage.setAttribute("aria-hidden", "true");
  stage.innerHTML = `
    <div class="diana-doubaowork-corner"></div>
    <div class="diana-doubaowork-upper"></div>
    <div class="diana-doubaowork-doodle"></div>
    <div class="diana-doubaowork-character-cluster">
      <div class="diana-doubaowork-star diana-doubaowork-star-small"></div>
      <div class="diana-doubaowork-star diana-doubaowork-star-large"></div>
      <div class="diana-doubaowork-candy"></div>
      <div class="diana-doubaowork-lollipop"></div>
      <div class="diana-doubaowork-acao diana-doubaowork-acao-heart"></div>
      <div class="diana-doubaowork-acao diana-doubaowork-acao-cheer"></div>
      <div class="diana-doubaowork-portrait"></div>
    </div>
  `;

  stage.style.setProperty("--diana-doubaowork-corner-image", `url("${assetUrl("diana-corner-line.png")}")`);
  stage.style.setProperty("--diana-doubaowork-upper-image", `url("${assetUrl("diana-upper-line.png")}")`);
  stage.style.setProperty("--diana-doubaowork-doodle-image", `url("${assetUrl("diana-doodle.png")}")`);
  stage.style.setProperty("--diana-doubaowork-portrait-night-image", `url("${assetUrl("diana-portrait-night.png")}")`);
  stage.style.setProperty("--diana-doubaowork-portrait-day-image", `url("${assetUrl("diana-portrait-day.png")}")`);
  stage.style.setProperty("--diana-doubaowork-star-image", `url("${assetUrl("diana-star.png")}")`);
  stage.style.setProperty("--diana-doubaowork-candy-image", `url("${assetUrl("diana-candy.png")}")`);
  stage.style.setProperty("--diana-doubaowork-lollipop-image", `url("${assetUrl("diana-lollipop.png")}")`);
  stage.style.setProperty("--diana-doubaowork-acao-heart-image", `url("${assetUrl("acao-heart.png")}")`);
  stage.style.setProperty("--diana-doubaowork-acao-cheer-image", `url("${assetUrl("acao-cheer.png")}")`);
  document.documentElement.appendChild(stage);

  let taggedSidebar = null;
  let refreshTimer = 0;

  function rgbFrom(value) {
    const match = value && value.match(/rgba?\(([^)]+)\)/i);
    if (!match) return null;
    const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length < 3 || parts.some((part, index) => index < 3 && Number.isNaN(part))) return null;
    if (parts.length > 3 && parts[3] === 0) return null;
    return parts.slice(0, 3);
  }

  function detectMode() {
    let declaredMode = null;
    try {
      declaredMode = document.documentElement.getAttribute("data-theme")
        || document.body?.getAttribute("data-theme")
        || localStorage.getItem("dbx-web-theme");
    } catch {
      // Some embedded pages can deny storage access; visual sampling below is the fallback.
    }

    if (["dark", "light", "system"].includes(declaredMode)) {
      const mode = declaredMode === "system"
        ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : declaredMode;
      if (document.documentElement.dataset.dianaDoubaoMode !== mode) {
        document.documentElement.dataset.dianaDoubaoMode = mode;
      }
      return;
    }

    const probes = [
      document.elementFromPoint(Math.max(1, window.innerWidth - 80), 160),
      document.body,
      document.documentElement
    ].filter(Boolean);
    let rgb = null;
    for (const probe of probes) {
      rgb = rgbFrom(getComputedStyle(probe).backgroundColor);
      if (rgb) break;
    }
    if (!rgb) {
      const mode = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      if (document.documentElement.dataset.dianaDoubaoMode !== mode) {
        document.documentElement.dataset.dianaDoubaoMode = mode;
      }
      return;
    }
    const [r, g, b] = rgb;
    const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
    const mode = luminance < 128 ? "dark" : "light";
    if (document.documentElement.dataset.dianaDoubaoMode !== mode) {
      document.documentElement.dataset.dianaDoubaoMode = mode;
    }
  }

  function detectSidebar() {
    const probe = document.elementFromPoint(Math.min(110, window.innerWidth * 0.12), Math.min(180, window.innerHeight * 0.25));
    let node = probe;
    let best = null;
    while (node && node !== document.body && node !== document.documentElement) {
      const rect = node.getBoundingClientRect();
      if (
        rect.left <= 12 &&
        rect.top <= 120 &&
        rect.width >= 168 &&
        rect.width <= 330 &&
        rect.height >= window.innerHeight * 0.62
      ) {
        best = node;
      }
      node = node.parentElement;
    }
    if (taggedSidebar && taggedSidebar !== best) {
      taggedSidebar.removeAttribute("data-diana-doubao-sidebar");
    }
    taggedSidebar = best;
    if (taggedSidebar) {
      if (!taggedSidebar.hasAttribute("data-diana-doubao-sidebar")) {
        taggedSidebar.setAttribute("data-diana-doubao-sidebar", "true");
      }
      const sidebarWidth = `${Math.round(taggedSidebar.getBoundingClientRect().width)}px`;
      if (document.documentElement.style.getPropertyValue("--diana-doubaowork-sidebar-width") !== sidebarWidth) {
        document.documentElement.style.setProperty("--diana-doubaowork-sidebar-width", sidebarWidth);
      }

      const interactiveCount = taggedSidebar.querySelectorAll(
        "a, button, [role='button'], [role='listitem']"
      ).length;
      const sidebarRect = taggedSidebar.getBoundingClientRect();
      const scrollProbeX = Math.max(sidebarRect.left + 2, sidebarRect.right - 12);
      const scrollProbeY = Math.min(
        sidebarRect.bottom - 72,
        Math.max(sidebarRect.top + 180, window.innerHeight * 0.62)
      );
      let scrollProbe = document.elementFromPoint(scrollProbeX, scrollProbeY);
      let hasScrollableHistory = false;
      while (scrollProbe && taggedSidebar.contains(scrollProbe)) {
        if (
          scrollProbe.clientHeight > 140 &&
          scrollProbe.scrollHeight > scrollProbe.clientHeight + 48
        ) {
          hasScrollableHistory = true;
          break;
        }
        if (scrollProbe === taggedSidebar) break;
        scrollProbe = scrollProbe.parentElement;
      }
      const descendantCount = taggedSidebar.querySelectorAll("*").length;
      const sidebarDense = (
        hasScrollableHistory ||
        interactiveCount >= 18 ||
        descendantCount >= 120
      );
      document.documentElement.classList.toggle(
        "diana-doubao-sidebar-dense",
        sidebarDense
      );
      document.documentElement.dataset.dianaDoubaoSidebarDensity = sidebarDense
        ? "dense"
        : "sparse";
    } else {
      document.documentElement.classList.remove("diana-doubao-sidebar-dense");
      delete document.documentElement.dataset.dianaDoubaoSidebarDensity;
    }
  }

  function detectModal() {
    const hasVisibleModal = Array.from(
      document.querySelectorAll('[role="dialog"], [aria-modal="true"]')
    ).some((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity || "1") > 0 &&
        rect.width > 8 &&
        rect.height > 8
      );
    });
    document.documentElement.classList.toggle(
      "diana-doubaowork-modal-open",
      hasVisibleModal
    );
  }

  function detectComposer() {
    const viewportBottom = window.innerHeight;
    const minWidth = Math.min(460, window.innerWidth * 0.42);
    const candidates = Array.from(
      document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')
    )
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width >= minWidth * 0.42 &&
          rect.height >= 24 &&
          rect.bottom >= viewportBottom - 180
        );
      })
      .map((element) => {
        let shell = element;
        let node = element.parentElement;
        while (node && node !== document.body && node !== document.documentElement) {
          const rect = node.getBoundingClientRect();
          if (
            rect.width >= minWidth &&
            rect.height >= 54 &&
            rect.height <= 220 &&
            rect.bottom >= viewportBottom - 28
          ) {
            shell = node;
          }
          if (rect.height > 240 || rect.top < viewportBottom * 0.55) break;
          node = node.parentElement;
        }
        return shell.getBoundingClientRect();
      })
      .sort((a, b) => b.width - a.width);

    const composer = candidates[0];
    const clearance = composer
      ? Math.ceil(Math.max(126, viewportBottom - composer.top + 18))
      : 142;
    const value = `${Math.min(clearance, 238)}px`;
    if (
      document.documentElement.style.getPropertyValue(
        "--diana-doubaowork-composer-clearance"
      ) !== value
    ) {
      document.documentElement.style.setProperty(
        "--diana-doubaowork-composer-clearance",
        value
      );
    }
  }

  function refresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      detectMode();
      detectSidebar();
      detectModal();
      detectComposer();
    }, 80);
  }

  new MutationObserver(refresh).observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true
  });
  addEventListener("resize", refresh, { passive: true });
  addEventListener("storage", refresh, { passive: true });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", refresh);
  refresh();
})();
