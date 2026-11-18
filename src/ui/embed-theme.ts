export function syncEmbedTheme(): void {
  const root = document.documentElement;
  root.dataset.iuiEmbed = "true";
  const sources = [root, document.body];
  let frame: Element | null = null;
  try {
    if (window.parent !== window) {
      frame = window.frameElement;
      sources.push(window.parent.document.documentElement, window.parent.document.body);
    }
  } catch {
    // Cross-origin hosts must signal theme changes inside the embedded document.
  }
  const apply = (theme: string | undefined) => {
    if ((theme === "light" || theme === "dark") && root.dataset.theme !== theme) root.dataset.theme = theme;
  };
  const sync = () => {
    // A different frame scheme makes browsers paint an opaque canvas behind the iframe.
    const canvasScheme = frame?.ownerDocument.defaultView?.getComputedStyle(frame).colorScheme;
    if (canvasScheme && root.style.colorScheme !== canvasScheme) root.style.colorScheme = canvasScheme;
    for (const source of sources) {
      if (!source) continue;
      const theme = source.classList.contains("light") ? "light" : source.classList.contains("dark") ? "dark"
        : source !== root ? source.dataset.theme : undefined;
      if (theme) { apply(theme); return; }
    }
  };
  const observer = new MutationObserver(sync);
  for (const source of sources) if (source) {
    observer.observe(source, { attributes: true, attributeFilter: source === root ? ["class"] : ["class", "data-theme", "style"] });
  }
  if (frame) observer.observe(frame, { attributes: true, attributeFilter: ["class", "style"] });
  window.addEventListener("themechange", (event) => {
    sync();
    const detail: unknown = (event as CustomEvent).detail;
    apply(typeof detail === "string" ? detail : detail && typeof detail === "object" && "theme" in detail ? String(detail.theme) : undefined);
  }, true);
  sync();
}
