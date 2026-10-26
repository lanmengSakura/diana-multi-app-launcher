window.__ModuleLoader__.load({
  id: "dsh-diana-theme",
  factory: () => {
    const { css, tokens } = __DIANA_PLUGIN_PAYLOAD__;
    const STYLE_ID = "dsh-diana-theme/styles";
    // Verified against the signed 0.2.1-rc.3 client bundle, not text/geometry guesses.
    const HOST_SELECTOR = ".an3WzG_root[data-phase]";
    function apply(ctx) {
      ctx.effect(() => ctx.theme.overrideTokens("dsh-diana-theme", tokens));
      ctx.effect(() => {
        const style = document.createElement("style");
        style.dataset.plugin = "dsh-diana-theme";
        style.dataset.pluginCss = STYLE_ID;
        style.textContent = css;
        document.head.append(style);
        const alreadyMarked = document.body.classList.contains("diana-dsh-host");
        document.body.classList.add("diana-dsh-host");
        const owned = new Map();
        let pending = 0;
        let disposed = false;
        function reconcile() {
          pending = 0;
          if (disposed) return;
          for (const [host, art] of owned) {
            if (!host.isConnected) { art.remove(); host.classList.remove("diana-dsh-surface"); owned.delete(host); }
          }
          for (const host of document.querySelectorAll(HOST_SELECTOR)) {
            if (owned.has(host)) continue;
            const art = document.createElement("div");
            art.className = "diana-dsh-art";
            art.setAttribute("aria-hidden", "true");
            for (const name of ["lines", "doodle", "portrait"]) {
              const node = document.createElement("span");
              node.className = `diana-dsh-${name}`;
              art.append(node);
            }
            host.classList.add("diana-dsh-surface");
            host.prepend(art);
            owned.set(host, art);
          }
        }
        const observer = new MutationObserver(() => {
          if (!pending && !disposed) pending = requestAnimationFrame(reconcile);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        reconcile();
        return () => {
          disposed = true;
          observer.disconnect();
          if (pending) cancelAnimationFrame(pending);
          for (const [host, art] of owned) { art.remove(); host.classList.remove("diana-dsh-surface"); }
          owned.clear();
          style.remove();
          if (!alreadyMarked) document.body.classList.remove("diana-dsh-host");
        };
      });
    }
    return { apply, inject: ["theme"] };
  }
});
