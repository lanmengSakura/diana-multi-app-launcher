(() => {
  const payload = __DIANA_PAYLOAD__;
  const root = document.documentElement;
  const selector = '#root [data-workspace-conversation-frame="true"]';
  const eligible = () => {
    const frame = document.querySelector(selector);
    return frame && document.querySelector('#root #content[data-panel]')?.contains(frame)
      && getComputedStyle(frame).position !== 'static' ? frame : null;
  };
  if (!eligible()) return { mounted: false, code: 'UNRECOGNIZED_WORKSPACE' };
  globalThis.__DIANA_ZCODE_THEME__?.disable();
  const previous = { dark: root.classList.contains('theme-zai-dark'), light: root.classList.contains('theme-zai-light') };
  if (previous.dark === previous.light) return { mounted: false, code: 'UNRECOGNIZED_NATIVE_THEME' };
  const style = document.createElement('style');
  style.id = 'diana-zcode-runtime-style';
  style.textContent = payload.css + '\nhtml.diana-zcode-host {' + Object.entries(payload.assets)
    .map(([name, value]) => `--diana-zcode-image-${name}:url("${value}");`).join('') + '}';
  document.head.append(style);
  root.classList.add('diana-zcode-host');
  let disabled = false, scheduled = 0, host = null, art = null;
  function setPalette() {
    if (payload.theme !== 'auto') {
      for (const mode of ['dark', 'light']) {
        if (root.classList.contains(`theme-zai-${mode}`) !== (payload.theme === mode)) {
          root.classList.toggle(`theme-zai-${mode}`, payload.theme === mode);
        }
      }
    }
  }
  function detach() {
    art?.remove();
    if (host) { host.classList.remove('diana-zcode-workspace'); host.removeAttribute('data-diana-zcode-workspace'); }
    host = art = null;
  }
  function mount() {
    scheduled = 0;
    if (disabled) return;
    const next = eligible();
    if (next === host && art?.isConnected) return;
    detach();
    if (!next) return;
    host = next;
    host.classList.add('diana-zcode-workspace');
    host.dataset.dianaZcodeWorkspace = 'true';
    art = document.createElement('div');
    art.id = 'diana-zcode-chrome';
    art.setAttribute('aria-hidden', 'true');
    for (const name of ['corner-line', 'upper-line', 'doodle']) {
      const span = document.createElement('span'); span.className = `diana-zcode-${name}`; art.append(span);
    }
    const cluster = document.createElement('span'); cluster.className = 'diana-zcode-character-cluster';
    for (const name of ['star diana-zcode-star-a', 'star diana-zcode-star-b', 'candy diana-zcode-candy-wrapped',
      'candy diana-zcode-candy-lollipop', 'acao diana-zcode-acao-heart', 'acao diana-zcode-acao-cheer', 'character']) {
      const span = document.createElement('span'); span.className = `diana-zcode-${name}`; cluster.append(span);
    }
    art.append(cluster); host.prepend(art);
  }
  const observer = new MutationObserver(() => { if (!disabled && !scheduled) scheduled = requestAnimationFrame(mount); });
  observer.observe(document.getElementById('root'), { childList: true, subtree: true });
  const paletteObserver = new MutationObserver(setPalette);
  paletteObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
  setPalette(); mount();
  const controller = {
    adapterVersion: payload.adapterVersion,
    snapshot() {
      return { mounted: !!host?.isConnected && !!art?.isConnected && style.isConnected,
        adapterVersion: payload.adapterVersion,
        rootTheme: root.classList.contains('theme-zai-light') ? 'light' : 'dark',
        pointerSafe: !!art && getComputedStyle(art).pointerEvents === 'none',
        belowContent: !!art && getComputedStyle(art).zIndex === '-1' };
    },
    disable() {
      disabled = true; observer.disconnect(); paletteObserver.disconnect();
      if (scheduled) cancelAnimationFrame(scheduled);
      detach(); style.remove(); root.classList.remove('diana-zcode-host');
      if (payload.theme !== 'auto') {
        root.classList.toggle('theme-zai-dark', previous.dark); root.classList.toggle('theme-zai-light', previous.light);
      }
      if (globalThis.__DIANA_ZCODE_THEME__ === controller) delete globalThis.__DIANA_ZCODE_THEME__;
      return { disabled: true };
    }
  };
  globalThis.__DIANA_ZCODE_THEME__ = controller;
  const snapshot = controller.snapshot();
  if (!snapshot.mounted || !snapshot.pointerSafe || !snapshot.belowContent) controller.disable();
  return snapshot;
})()
