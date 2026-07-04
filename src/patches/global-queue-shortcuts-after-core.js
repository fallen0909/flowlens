(() => {
  if (window.__flowLensGlobalQueueShortcutsAfterCore) return;
  window.__flowLensGlobalQueueShortcutsAfterCore = true;

  function appRoot() {
    const node = document.getElementById("xiv-root");
    return node?.dataset.active === "true" ? node : null;
  }

  function lightboxOpen() {
    return document.getElementById("xiv-lightbox")?.dataset.active === "true";
  }

  function isTypingTarget(target) {
    return !!target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  }

  function stop(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }

  function clickQueue(delta) {
    const app = appRoot();
    if (!app || lightboxOpen()) return false;
    const selector = delta > 0 ? '[data-xiv="next-set"]' : '[data-xiv="prev-set"]';
    const button = app.querySelector(selector);
    if (!button) return false;
    button.disabled = false;
    button.dataset.enabled = "true";
    button.click();
    return true;
  }

  function handle(event) {
    if (!appRoot() || lightboxOpen()) return;
    if (isTypingTarget(event.target) || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (clickQueue(event.key === "ArrowRight" ? 1 : -1)) stop(event);
  }

  window.addEventListener("keydown", handle, false);
  document.addEventListener("keydown", handle, false);
})();
