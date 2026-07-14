(() => {
  if (window.__flowLensSettingsStore) return;

  const SETTINGS_KEY = "flowlens-settings-v2";
  const DELAYS = [800, 1200, 1800, 2400, 3200];
  const DEFAULTS = {
    launchHidden: false,
    launchCompact: false,
    launchX: 0,
    launchY: 0,
    autoFullscreen: true,
    videoPreview: true,
    theme: "system",
    columns: 3,
    autoScrollSpeed: 3,
    downloadFolder: "",
    lightboxAutoDelay: 1200
  };

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  function sanitize(input = {}) {
    const result = {};
    if ("launchHidden" in input) result.launchHidden = input.launchHidden === true;
    if ("launchCompact" in input) result.launchCompact = input.launchCompact === true;
    if ("launchX" in input) result.launchX = clamp(input.launchX, -10000, 10000, 0);
    if ("launchY" in input) result.launchY = clamp(input.launchY, -10000, 10000, 0);
    if ("autoFullscreen" in input) result.autoFullscreen = input.autoFullscreen !== false;
    if ("videoPreview" in input) result.videoPreview = input.videoPreview !== false;
    if ("theme" in input) result.theme = ["system", "dark", "light"].includes(input.theme) ? input.theme : "system";
    if ("columns" in input) result.columns = clamp(input.columns, 2, 8, 3);
    if ("autoScrollSpeed" in input) result.autoScrollSpeed = clamp(input.autoScrollSpeed, 1, 10, 3);
    if ("downloadFolder" in input) result.downloadFolder = String(input.downloadFolder || "").replace(/[<>:"|?*\x00-\x1f]+/g, "_").slice(0, 120);
    if ("lightboxAutoDelay" in input) {
      const delay = Number(input.lightboxAutoDelay);
      result.lightboxAutoDelay = DELAYS.includes(delay) ? delay : 1200;
    }
    return result;
  }

  let current = { ...DEFAULTS, ...sanitize(window.__FLOWLENS_EXTENSION_SETTINGS__ || {}) };

  function read() {
    return { ...current };
  }

  function notify() {
    window.dispatchEvent(new CustomEvent("flowlens:settings-sync", { detail: { settings: read() } }));
    document.documentElement.classList.toggle("xiv-fl-launch-hidden", current.launchHidden === true);
  }

  function replace(settings, persist = false) {
    current = { ...DEFAULTS, ...current, ...sanitize(settings || {}) };
    window.__FLOWLENS_EXTENSION_SETTINGS__ = read();
    notify();
    if (persist) chrome.storage.sync.set({ [SETTINGS_KEY]: current });
    return read();
  }

  function write(patch) {
    return replace(patch, true);
  }

  async function load() {
    try {
      const result = await chrome.storage.sync.get(SETTINGS_KEY);
      replace(result?.[SETTINGS_KEY] || {}, false);
    } catch {
      notify();
    }
    return read();
  }

  window.__flowLensSettingsStore = { read, write, replace, load };
  window.__flowLensGlobalSettings = true;
  window.__flowLensApplyGlobalSettings = load;
  window.__flowLensSyncGlobalSettings = () => chrome.storage.sync.set({ [SETTINGS_KEY]: current });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes[SETTINGS_KEY]?.newValue) return;
    replace(changes[SETTINGS_KEY].newValue, false);
  });

  notify();
  load();
})();
