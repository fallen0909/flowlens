(() => {
  if (window.__flowLensUiCleanup) return;
  window.__flowLensUiCleanup = true;

  const css = `
    .xiv-fl-lightbox-auto {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
      opacity: 0 !important;
    }
  `;

  function injectStyle() {
    if (document.getElementById("xiv-fl-ui-cleanup-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-fl-ui-cleanup-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function removeIntrusiveAutoButtons() {
    document.querySelectorAll("#xiv-root .xiv-fl-lightbox-auto").forEach((button) => button.remove());
  }

  let observedRoot = null;
  let rootObserver = null;
  let bootstrapObserver = null;
  function observeViewerRoot() {
    const root = document.getElementById("xiv-root");
    if (!root || root === observedRoot) return;
    rootObserver?.disconnect();
    observedRoot = root;
    rootObserver = new MutationObserver(removeIntrusiveAutoButtons);
    rootObserver.observe(root, { childList: true, subtree: true });
    bootstrapObserver?.disconnect();
    bootstrapObserver = null;
    removeIntrusiveAutoButtons();
  }

  injectStyle();
  bootstrapObserver = new MutationObserver(observeViewerRoot);
  bootstrapObserver.observe(document.documentElement, { childList: true, subtree: true });
  observeViewerRoot();
})();
