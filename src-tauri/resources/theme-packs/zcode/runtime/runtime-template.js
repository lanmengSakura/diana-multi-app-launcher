(() => {
  const bytes = Uint8Array.from(atob("__DIANA_PAYLOAD_BASE64__"), (character) => character.charCodeAt(0));
  const payload = JSON.parse(new TextDecoder().decode(bytes));
  const root = document.documentElement;
  const runtimeId = "diana-zcode-runtime-style";
  const chromeId = "diana-zcode-chrome";
  const previous = globalThis.__DIANA_ZCODE_THEME__;
  if (previous && typeof previous.disable === "function") previous.disable();

  const previousTheme = {
    dark: root.classList.contains("theme-zai-dark"),
    light: root.classList.contains("theme-zai-light")
  };
  if (payload.requestedTheme === "dark" || payload.requestedTheme === "light") {
    root.classList.toggle("theme-zai-dark", payload.requestedTheme === "dark");
    root.classList.toggle("theme-zai-light", payload.requestedTheme === "light");
  }

  const style = document.createElement("style");
  style.id = runtimeId;
  style.dataset.dianaAdapter = payload.adapterVersion;
  const assetVariables = `
html.diana-zcode-host {
  --diana-zcode-image-character-dark: url("${payload.assets.characterDark}");
  --diana-zcode-image-character-light: url("${payload.assets.characterLight}");
  --diana-zcode-image-doodle: url("${payload.assets.doodle}");
  --diana-zcode-image-upper: url("${payload.assets.upper}");
  --diana-zcode-image-corner: url("${payload.assets.corner}");
  --diana-zcode-image-star: url("${payload.assets.star}");
  --diana-zcode-image-candy-wrapped: url("${payload.assets.candyWrapped}");
  --diana-zcode-image-candy-lollipop: url("${payload.assets.candyLollipop}");
  --diana-zcode-image-acao-heart: url("${payload.assets.acaoHeart}");
  --diana-zcode-image-acao-cheer: url("${payload.assets.acaoCheer}");
}`;
  style.textContent = `${payload.css}\n${assetVariables}`;
  document.head.append(style);
  root.classList.add("diana-zcode-host");

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

  const state = {
    adapterVersion: payload.adapterVersion,
    observer: null,
    resizeObserver: null,
    scheduled: false,
    workspace: null,
    foreground: null,
    rail: null,
    railStats: null,
    previousPosition: "",
    previousIsolation: "",
    previousForegroundPosition: "",
    previousForegroundZIndex: "",
    previousTheme
  };

  function ancestors(element) {
    const list = [];
    let current = element;
    while (current && current !== document.body) {
      list.push(current);
      current = current.parentElement;
    }
    return list;
  }

  function qualifies(element) {
    const rect = element.getBoundingClientRect();
    return rect.left >= 180
      && rect.left <= Math.min(380, innerWidth * .36)
      && rect.top >= 30
      && rect.top <= 90
      && rect.width >= innerWidth * .58
      && rect.height >= innerHeight * .68;
  }

  function findWorkspace() {
    const rootElement = document.getElementById("root");
    if (!rootElement) return null;
    const textarea = rootElement.querySelector("textarea");
    if (textarea) {
      const candidate = ancestors(textarea).find(qualifies);
      if (candidate) return candidate;
    }
    const point = document.elementFromPoint(Math.max(0, innerWidth - 8), Math.max(0, innerHeight - 8));
    const pointCandidate = point ? ancestors(point).find(qualifies) : null;
    if (pointCandidate) return pointCandidate;
    const all = [...rootElement.querySelectorAll("div, main, section")].filter(qualifies);
    return all.sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      return (a.width * a.height) - (b.width * b.height);
    })[0] || null;
  }

  function directChildUnder(ancestor, element) {
    let current = element;
    while (current?.parentElement && current.parentElement !== ancestor) {
      current = current.parentElement;
    }
    return current?.parentElement === ancestor ? current : null;
  }

  function findForeground(workspace) {
    const preferredTarget = workspace.querySelector(
      "textarea, [contenteditable='true'], input:not([type='hidden']), button"
    );
    const preferredChild = preferredTarget ? directChildUnder(workspace, preferredTarget) : null;
    if (preferredChild && preferredChild.id !== chromeId) return preferredChild;
    const workspaceRect = workspace.getBoundingClientRect();
    return [...workspace.children]
      .filter((child) => child.id !== chromeId)
      .map((child) => ({ child, rect: child.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width >= workspaceRect.width * .72 && rect.height >= workspaceRect.height * .72)
      .sort((left, right) => (right.rect.width * right.rect.height) - (left.rect.width * left.rect.height))[0]?.child || null;
  }

  function railButtonsFor(element) {
    const direct = [...element.children].filter((child) => child.tagName === "BUTTON");
    return direct.length >= 4 ? direct : [...element.querySelectorAll("button")];
  }

  function findMessageRail(workspace) {
    const workspaceRect = workspace.getBoundingClientRect();
    return [...document.querySelectorAll("nav, aside, div")]
      .map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
        buttons: railButtonsFor(element)
      }))
      .filter(({ rect, buttons }) => buttons.length >= 4
        && rect.left >= workspaceRect.left
        && rect.left <= workspaceRect.left + 96
        && rect.width >= 28
        && rect.width <= 56
        && rect.height >= Math.min(180, innerHeight * .3)
        && buttons.filter((button) => {
          const buttonRect = button.getBoundingClientRect();
          const line = button.querySelector(":scope > span");
          const lineRect = line?.getBoundingClientRect();
          return buttonRect.width >= 28
            && buttonRect.width <= 56
            && buttonRect.height >= 6
            && buttonRect.height <= 18
            && lineRect
            && lineRect.width >= 4
            && lineRect.width <= 20
            && lineRect.height > 0
            && lineRect.height <= 4;
        }).length >= Math.ceil(buttons.length * .8))
      .sort((left, right) => Math.abs(left.rect.left - (workspaceRect.left + 12))
        - Math.abs(right.rect.left - (workspaceRect.left + 12))
        || Math.abs(left.rect.width - 36) - Math.abs(right.rect.width - 36)
        || right.buttons.length - left.buttons.length)[0]?.element || null;
  }

  function railProfileFor(count) {
    return Object.entries(railProfiles).find(([, profile]) => count <= profile.max)
      || ["dense", railProfiles.dense];
  }

  function railScaleAt(index, profile) {
    const block = Math.floor(index / profile.pattern.length);
    const slot = (index + block * 7) % profile.pattern.length;
    return index % 5 === 0
      ? profile.majors[Math.floor(index / 5) % profile.majors.length]
      : profile.pattern[slot];
  }

  function detachRail() {
    if (!state.rail) return;
    state.rail.classList.remove("diana-zcode-message-rail");
    delete state.rail.dataset.dianaRailProfile;
    for (const button of railButtonsFor(state.rail)) {
      button.style.removeProperty("--diana-art-scale");
      delete button.dataset.dianaRailMajor;
      delete button.dataset.dianaViewportCurrent;
    }
    state.rail = null;
    state.railStats = null;
  }

  function updateRail() {
    if (!state.workspace?.isConnected) return null;
    const retainedRail = state.rail?.isConnected
      && railButtonsFor(state.rail).length >= 4
      && state.rail.getBoundingClientRect().width > 0
      ? state.rail
      : null;
    const rail = retainedRail || findMessageRail(state.workspace);
    if (state.rail && state.rail !== rail) detachRail();
    if (!rail) return null;

    state.rail = rail;
    rail.classList.add("diana-zcode-message-rail");
    const buttons = railButtonsFor(rail);
    const [profileName, profile] = railProfileFor(buttons.length);
    rail.dataset.dianaRailProfile = profileName;
    const current = buttons.find((button) => button.getAttribute("aria-current") === "location")
      || buttons.find((button) => button.dataset.active === "true")
      || buttons.at(-1);

    buttons.forEach((button, index) => {
      const scale = String(railScaleAt(index, profile));
      const major = String(index % 5 === 0);
      if (button.style.getPropertyValue("--diana-art-scale") !== scale) {
        button.style.setProperty("--diana-art-scale", scale);
      }
      if (button.dataset.dianaRailMajor !== major) button.dataset.dianaRailMajor = major;
      if (button === current) button.dataset.dianaViewportCurrent = "true";
      else delete button.dataset.dianaViewportCurrent;
    });

    state.railStats = {
      count: buttons.length,
      profile: profileName,
      majorCount: buttons.filter((button) => button.dataset.dianaRailMajor === "true").length,
      currentCount: buttons.filter((button) => button.dataset.dianaViewportCurrent === "true").length
    };
    return state.railStats;
  }

  function buildChrome() {
    const chrome = document.createElement("div");
    chrome.id = chromeId;
    chrome.setAttribute("aria-hidden", "true");
    chrome.dataset.dianaAdapter = payload.adapterVersion;
    for (const className of [
      "diana-zcode-corner-line",
      "diana-zcode-upper-line",
      "diana-zcode-doodle"
    ]) {
      const element = document.createElement("span");
      element.className = className;
      chrome.append(element);
    }
    const cluster = document.createElement("span");
    cluster.className = "diana-zcode-character-cluster";
    for (const className of [
      "diana-zcode-star diana-zcode-star-a",
      "diana-zcode-star diana-zcode-star-b",
      "diana-zcode-candy diana-zcode-candy-wrapped",
      "diana-zcode-candy diana-zcode-candy-lollipop",
      "diana-zcode-acao diana-zcode-acao-heart",
      "diana-zcode-acao diana-zcode-acao-cheer",
      "diana-zcode-character"
    ]) {
      const element = document.createElement("span");
      element.className = className;
      cluster.append(element);
    }
    chrome.append(cluster);
    return chrome;
  }

  function updateChromeGeometry() {
    const chrome = document.getElementById(chromeId);
    if (!chrome || !state.workspace?.isConnected) return;
    const rect = state.workspace.getBoundingClientRect();
    chrome.style.left = `${Math.round(rect.left)}px`;
    chrome.style.top = `${Math.round(rect.top)}px`;
    chrome.style.width = `${Math.round(rect.width)}px`;
    chrome.style.height = `${Math.round(rect.height)}px`;
  }

  function detachWorkspace() {
    detachRail();
    state.resizeObserver?.disconnect();
    state.resizeObserver = null;
    document.getElementById(chromeId)?.remove();
    if (state.foreground?.isConnected) {
      state.foreground.classList.remove("diana-zcode-foreground");
      state.foreground.style.position = state.previousForegroundPosition;
      state.foreground.style.zIndex = state.previousForegroundZIndex;
    }
    if (state.workspace?.isConnected) {
      state.workspace.classList.remove("diana-zcode-workspace");
      state.workspace.removeAttribute("data-diana-zcode-workspace");
      state.workspace.style.position = state.previousPosition;
      state.workspace.style.isolation = state.previousIsolation;
    }
    state.foreground = null;
    state.workspace = null;
  }

  function mount() {
    const workspace = findWorkspace();
    if (!workspace) return false;
    const foreground = findForeground(workspace);
    if (state.workspace === workspace
      && state.foreground === foreground
      && document.getElementById(chromeId)?.isConnected) {
      updateChromeGeometry();
      updateRail();
      return true;
    }
    detachWorkspace();
    state.workspace = workspace;
    state.foreground = foreground;
    state.previousPosition = workspace.style.position;
    state.previousIsolation = workspace.style.isolation;
    if (getComputedStyle(workspace).position === "static") workspace.style.position = "relative";
    workspace.style.isolation = "isolate";
    workspace.classList.add("diana-zcode-workspace");
    workspace.dataset.dianaZcodeWorkspace = "true";
    workspace.prepend(buildChrome());
    updateChromeGeometry();
    state.resizeObserver = new ResizeObserver(updateChromeGeometry);
    state.resizeObserver.observe(workspace);
    if (foreground) {
      state.previousForegroundPosition = foreground.style.position;
      state.previousForegroundZIndex = foreground.style.zIndex;
      if (getComputedStyle(foreground).position === "static") foreground.style.position = "relative";
      foreground.style.zIndex = "1";
      foreground.classList.add("diana-zcode-foreground");
    }
    updateRail();
    return true;
  }

  function scheduleMount() {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(() => {
      state.scheduled = false;
      mount();
    });
  }

  state.observer = new MutationObserver((mutations) => {
    const railStateChanged = state.rail?.isConnected && mutations.some((mutation) => (
      mutation.type === "attributes" && state.rail.contains(mutation.target)
    ));
    if (railStateChanged) updateRail();
    else scheduleMount();
  });
  state.observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-current", "data-active"]
  });
  const mounted = mount();

  state.disable = () => {
    state.observer?.disconnect();
    detachWorkspace();
    document.getElementById(runtimeId)?.remove();
    root.classList.remove("diana-zcode-host");
    root.classList.toggle("theme-zai-dark", state.previousTheme.dark);
    root.classList.toggle("theme-zai-light", state.previousTheme.light);
    if (globalThis.__DIANA_ZCODE_THEME__ === state) delete globalThis.__DIANA_ZCODE_THEME__;
    return { disabled: true };
  };
  globalThis.__DIANA_ZCODE_THEME__ = state;

  const rect = state.workspace?.getBoundingClientRect();
  return {
    mounted,
    adapterVersion: payload.adapterVersion,
    rootTheme: root.classList.contains("theme-zai-light") ? "light" : "dark",
    rail: state.railStats,
    workspace: rect ? {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    } : null
  };
})()
