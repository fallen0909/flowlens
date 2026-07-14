(() => {
  if (window.__flowLensBootstrap) return;
  window.__flowLensBootstrap = true;

  const SETTINGS_KEY = "flowlens-settings-v2";
  const BUTTON_ID = "flowlens-bootstrap-launch";
  let activating = false;

  function isTyping(target) {
    return !!target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  }

  function removeBootstrapButton() {
    document.getElementById(BUTTON_ID)?.remove();
  }

  async function activate() {
    if (activating) return;
    if (window.__flowLensViewer && window.__flowLensControl) {
      chrome.runtime.sendMessage({ type: "FLOWLENS_ACTIVATE" });
      return;
    }
    activating = true;
    const button = document.getElementById(BUTTON_ID);
    if (button) button.dataset.loading = "true";
    try {
      const response = await chrome.runtime.sendMessage({ type: "FLOWLENS_ACTIVATE" });
      if (!response?.ok) throw new Error(response?.error || "启动失败");
      removeBootstrapButton();
    } catch (error) {
      if (button) {
        button.dataset.loading = "false";
        button.title = String(error?.message || error || "启动失败");
      }
    } finally {
      activating = false;
    }
  }

  function ensureButton(settings = {}) {
    if (window.__flowLensViewer || document.getElementById("xiv-launch")) {
      removeBootstrapButton();
      return;
    }
    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement("button");
      button.id = BUTTON_ID;
      button.type = "button";
      button.textContent = "瀑光";
      button.title = "打开瀑光 FlowLens（G）";
      button.setAttribute("aria-label", button.title);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        activate();
      });
      const style = document.createElement("style");
      style.id = `${BUTTON_ID}-style`;
      style.textContent = `
        #${BUTTON_ID} {
          position: fixed; right: 18px; bottom: 92px; z-index: 2147483646;
          min-width: 58px; height: 42px; padding: 0 15px; border: 1px solid rgba(255,255,255,.28);
          border-radius: 999px; background: rgba(18,20,26,.86); color: #fff;
          box-shadow: 0 10px 28px rgba(0,0,0,.3); backdrop-filter: blur(12px);
          font: 850 14px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
          cursor: pointer; user-select: none; transition: opacity .16s ease, transform .16s ease;
        }
        #${BUTTON_ID}:hover { transform: translateY(-1px); }
        #${BUTTON_ID}[data-loading="true"] { opacity: .55; pointer-events: none; }
      `;
      document.documentElement.append(style, button);
    }
    button.hidden = settings.launchHidden === true;
  }

  function loadSettings() {
    try {
      chrome.storage.sync.get(SETTINGS_KEY, (result) => ensureButton(result?.[SETTINGS_KEY] || {}));
    } catch {
      ensureButton();
    }
  }

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.repeat || isTyping(event.target)) return;
    if (event.key.toLowerCase() !== "g" || event.altKey || event.ctrlKey || event.metaKey) return;
    if (window.__flowLensViewer) return;
    event.preventDefault();
    event.stopPropagation();
    activate();
  }, true);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes[SETTINGS_KEY]) return;
    ensureButton(changes[SETTINGS_KEY].newValue || {});
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadSettings, { once: true });
  else loadSettings();
})();
