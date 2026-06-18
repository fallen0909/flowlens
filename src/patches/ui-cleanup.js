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
    document.querySelectorAll(".xiv-fl-lightbox-auto").forEach((button) => button.remove());
  }

  injectStyle();
  removeIntrusiveAutoButtons();
  new MutationObserver(removeIntrusiveAutoButtons).observe(document.documentElement, { childList: true, subtree: true });
  window.setInterval(removeIntrusiveAutoButtons, 800);
})();
