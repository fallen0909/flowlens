(() => {
  if (window.__flowLensGlobalQueueShortcuts) return;
  window.__flowLensGlobalQueueShortcuts = true;

  function root() {
    return document.getElementById("xiv-root");
  }

  function lightbox() {
    return document.getElementById("xiv-lightbox");
  }

  function isTypingTarget(target) {
    return !!target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  }

  function claim(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function queueButton(delta) {
    const app = root();
    if (!app) return null;
    const selector = delta > 0 ? '[data-xiv="next-set"]' : '[data-xiv="prev-set"]';
    return app.querySelector(selector);
  }

  function triggerQueueSwitch(delta) {
    const button = queueButton(delta);
    if (!button) return false;
    button.disabled = false;
    button.dataset.enabled = "true";
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }

  function onKeydown(event) {
    const app = root();
    if (!app || app.dataset.active !== "true") return;
    if (lightbox()?.dataset.active === "true") return;
    if (isTypingTarget(event.target) || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;

    const oldPrev = event.key === "," || event.key === "，" || event.code === "Comma";
    const oldNext = event.key === "." || event.key === "。" || event.code === "Period";
    if (oldPrev || oldNext) {
      claim(event);
      return;
    }

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    claim(event);
    triggerQueueSwitch(event.key === "ArrowRight" ? 1 : -1);
  }

  window.addEventListener("keydown", onKeydown, true);
})();
