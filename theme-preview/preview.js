const root = document.documentElement;
const params = new URLSearchParams(window.location.search);
const allowedThemes = new Set(["dark", "light"]);
const requestedTheme = params.get("theme");
const storedTheme = localStorage.getItem("diana-zcode-preview-theme");
const initialTheme = allowedThemes.has(requestedTheme)
  ? requestedTheme
  : allowedThemes.has(storedTheme)
    ? storedTheme
    : "dark";

const railProfiles = {
  sparse: {
    max: 32,
    pattern: [.26, .35, .29, .46, .31, .39, .25, .43, .33, .28, .48, .30, .37, .27, .41, .34, .29, .45, .32, .38, .25, .44, .30],
    majors: [.56, .62, .53, .59, .64, .55]
  },
  balanced: {
    max: 96,
    pattern: [.24, .33, .27, .41, .30, .36, .25, .39, .32, .28, .43, .29, .35, .26, .40, .31, .27, .42, .30, .37, .24, .38, .28, .34, .26, .41, .29],
    majors: [.49, .55, .47, .52, .57, .50, .54]
  },
  dense: {
    max: Number.POSITIVE_INFINITY,
    pattern: [.23, .31, .26, .36, .28, .33, .24, .35, .29, .27, .37, .25, .32, .28, .34, .24, .36, .30, .26, .33, .23, .35, .27, .31, .25, .34, .29, .24, .32],
    majors: [.42, .47, .40, .45, .43, .48, .41, .46, .44]
  }
};

function railProfileFor(count) {
  return Object.entries(railProfiles).find(([, profile]) => count <= profile.max) || ["dense", railProfiles.dense];
}

function railScaleAt(index, profile) {
  const block = Math.floor(index / profile.pattern.length);
  const slot = (index + block * 7) % profile.pattern.length;
  const major = index % 5 === 0;
  return major
    ? profile.majors[Math.floor(index / 5) % profile.majors.length]
    : profile.pattern[slot];
}

function setPreviewRailCurrent(rail, currentIndex) {
  const buttons = [...rail.querySelectorAll(":scope > button")];
  const nextIndex = Math.max(0, Math.min(buttons.length - 1, currentIndex));
  buttons.forEach((button, index) => {
    const isCurrent = index === nextIndex;
    button.dataset.active = String(isCurrent);
    if (isCurrent) {
      button.dataset.dianaViewportCurrent = "true";
      button.setAttribute("aria-current", "location");
    } else {
      delete button.dataset.dianaViewportCurrent;
      button.removeAttribute("aria-current");
    }
  });
}

function setPreviewRailInteraction(rail, interactionIndex) {
  const buttons = [...rail.querySelectorAll(":scope > button")];
  buttons.forEach((button, index) => {
    const distance = Number.isInteger(interactionIndex)
      ? Math.abs(index - interactionIndex)
      : Number.POSITIVE_INFINITY;
    button.dataset.visualTone = distance === 0
      ? "peak"
      : distance === 1
        ? "near"
        : distance === 2
          ? "mid"
          : "idle";
  });
}

function renderPreviewRail(requestedCount = 91) {
  const rail = document.querySelector(".diana-zcode-message-rail");
  if (!rail) return null;
  const count = Math.max(1, Math.min(240, Number.parseInt(requestedCount, 10) || 91));
  const [profileName, profile] = railProfileFor(count);
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < count; index += 1) {
    const button = document.createElement("button");
    const line = document.createElement("span");
    button.type = "button";
    button.setAttribute("aria-label", `消息位置 ${index + 1}`);
    button.dataset.dianaRailIndex = String(index);
    button.dataset.dianaRailMajor = String(index % 5 === 0);
    button.dataset.visualTone = "idle";
    button.style.setProperty("--diana-art-scale", String(railScaleAt(index, profile)));
    button.append(line);
    button.addEventListener("click", () => setPreviewRailCurrent(rail, index));
    button.addEventListener("pointerenter", () => setPreviewRailInteraction(rail, index));
    button.addEventListener("focus", () => setPreviewRailInteraction(rail, index));
    button.addEventListener("blur", () => setPreviewRailInteraction(rail));
    fragment.append(button);
  }
  rail.replaceChildren(fragment);
  rail.dataset.dianaRailProfile = profileName;
  setPreviewRailCurrent(rail, count - 1);
  setPreviewRailInteraction(rail);
  rail.scrollTop = rail.scrollHeight;
  return rail;
}

document.querySelector(".diana-zcode-message-rail")?.addEventListener("pointerleave", (event) => {
  setPreviewRailInteraction(event.currentTarget);
});

window.__DIANA_ZCODE_PREVIEW_RAIL__ = {
  render: renderPreviewRail,
  setCurrent(index) {
    const rail = document.querySelector(".diana-zcode-message-rail");
    if (rail) setPreviewRailCurrent(rail, index);
  }
};

if (params.get("clean") === "1") {
  root.classList.add("is-clean-preview");
}

function setTheme(theme, persist = true) {
  if (!allowedThemes.has(theme)) return;

  root.dataset.zcodeTheme = theme;
  root.style.colorScheme = theme;
  document.querySelectorAll("[data-theme-button]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeButton === theme));
  });

  const heading = document.querySelector(".native-workspace-layer h1");
  if (heading) {
    heading.textContent = theme === "dark"
      ? "夜深啦，别忘了照顾好自己哦"
      : "今天也要活力满满呀";
  }

  if (persist) localStorage.setItem("diana-zcode-preview-theme", theme);
}

document.querySelectorAll("[data-theme-button]").forEach((button) => {
  button.addEventListener("click", () => setTheme(button.dataset.themeButton));
});

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLTextAreaElement) return;
  if (event.key.toLowerCase() === "d") setTheme("dark");
  if (event.key.toLowerCase() === "l") setTheme("light");
});

renderPreviewRail(params.get("railCount") || 91);
setTheme(initialTheme, false);
