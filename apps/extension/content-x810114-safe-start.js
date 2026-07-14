(() => {
  if (window.__flowLensX810114SafeStartPatch) return;
  window.__flowLensX810114SafeStartPatch = true;

  function isTarget() {
    try {
      return /(^|\.)x\.810114\.xyz$/i.test(location.hostname);
    } catch {
      return false;
    }
  }

  if (!isTarget()) return;

  const AUTO_OPEN_KEY = "flowlens-gallery-queue-auto-open";

  function clearAutoOpen() {
    try { sessionStorage.removeItem(AUTO_OPEN_KEY); } catch {}
  }

  clearAutoOpen();
  window.addEventListener("pageshow", clearAutoOpen, true);
  window.addEventListener("beforeunload", clearAutoOpen, true);

  try {
    const originalGetItem = Storage.prototype.getItem;
    if (!Storage.prototype.__flowLensX810114SafeGetItem) {
      Object.defineProperty(Storage.prototype, "__flowLensX810114SafeGetItem", { value: true, configurable: true });
      Storage.prototype.getItem = function flowLensSafeGetItem(key) {
        if (this === sessionStorage && key === AUTO_OPEN_KEY && isTarget()) return "";
        return originalGetItem.call(this, key);
      };
    }
  } catch {
    // Storage can be locked down on some browsers; clearing the key above is enough for normal cases.
  }
})();