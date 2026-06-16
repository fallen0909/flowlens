(() => {
  if (window.__flowLensSettingsSync) return;
  window.__flowLensSettingsSync = true;

  const SETTINGS_KEY = "flowlens-settings-v2";
  const SYNC_KEYS = [
    "launchHidden",
    "launchCompact",
    "autoFullscreen",
    "videoPreview",
    "theme",
    "columns",
    "autoScrollSpeed"
  ];
  let applying = false;
  let saveTimer = 0;

  function storageLocal() {
    try {
      return typeof chrome !== "undefined" ? chrome.storage?.local : null;
    } catch {
      return null;
    }
  }

  function readLocalSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  function writeLocalSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings || {}));
    } catch {
      // Storage can be blocked on some pages.
    }
  }

  function pickSyncSettings(settings) {
    const picked = {};
    for (const key of SYNC_KEYS) {
      if (Object.prototype.hasOwnProperty.call(settings || {}, key)) picked[key] = settings[key];
    }
    return picked;
  }

  function mergeSettings(base, patch) {
    return { ...(base || {}), ...pickSyncSettings(patch || {}) };
  }

  function applyLaunchVisibility(settings) {
    document.documentElement.classList.toggle("xiv-fl-launch-hidden", settings?.launchHidden === true);
  }

  function syncControls(settings) {
    document.querySelectorAll("#xiv-root [data-setting], #xiv-root [data-fl-setting]").forEach((control) => {
      const key = control.dataset.setting || control.dataset.flSetting;
      if (!key || !Object.prototype.hasOwnProperty.call(settings, key)) return;
      if (control.type === "checkbox") control.checked = !!settings[key];
      else control.value = String(settings[key]);
    });
  }

  function applySettings(settings) {
    applying = true;
    const local = readLocalSettings();
    const merged = mergeSettings(local, settings);
    writeLocalSettings(merged);
    applyLaunchVisibility(merged);
    syncControls(merged);
    setTimeout(() => { applying = false; }, 0);
  }

  function saveToGlobalSoon() {
    if (applying) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const storage = storageLocal();
      if (!storage?.set) return;
      const local = readLocalSettings();
      storage.set({ [SETTINGS_KEY]: pickSyncSettings(local) });
    }, 120);
  }

  function loadGlobalSettings() {
    const storage = storageLocal();
    if (!storage?.get) return;
    storage.get(SETTINGS_KEY, (result) => {
      if (chrome.runtime?.lastError) return;
      const global = result?.[SETTINGS_KEY];
      const local = readLocalSettings();
      if (global && typeof global === "object" && Object.keys(global).length) {
        applySettings(global);
        return;
      }
      if (Object.keys(local).length) {
        storage.set({ [SETTINGS_KEY]: pickSyncSettings(local) });
      }
    });
  }

  function bindGlobalChanges() {
    try {
      chrome.storage?.onChanged?.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        const next = changes?.[SETTINGS_KEY]?.newValue;
        if (!next || typeof next !== "object") return;
        applySettings(next);
      });
    } catch {
      // Ignore unsupported extension storage events.
    }
  }

  function bindUiChanges() {
    document.addEventListener("change", (event) => {
      if (!event.target?.closest?.("#xiv-root [data-setting], #xiv-root [data-fl-setting]")) return;
      setTimeout(saveToGlobalSoon, 80);
    }, true);
    document.addEventListener("click", (event) => {
      if (!event.target?.closest?.("#xiv-root [data-fl-stepper], #xiv-root [data-xiv]")) return;
      setTimeout(saveToGlobalSoon, 160);
    }, true);
  }

  loadGlobalSettings();
  bindGlobalChanges();
  bindUiChanges();
  setInterval(() => applyLaunchVisibility(readLocalSettings()), 1200);
})();
