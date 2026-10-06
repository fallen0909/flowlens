(() => {
  if (window.__flowLensGlobalSettings) return;
  window.__flowLensGlobalSettings = true;
  if (window.__flowLensSettingsStore || typeof GM_getValue !== "function") return;
  const SETTINGS_KEY = "flowlens-settings-v2";
  const GLOBAL_KEY = "flowlens-global-settings-v2";
  const SYNC_KEYS = ["launchHidden", "launchCompact", "autoFullscreen", "videoPreview", "theme", "columns", "autoScrollSpeed", "lightboxAutoDelay"];
  const parse = value => { try { return typeof value === "string" ? JSON.parse(value) || {} : value || {}; } catch { return {}; } };
  const pick = value => Object.fromEntries(SYNC_KEYS.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
  function readLocal() { try { return parse(localStorage.getItem(SETTINGS_KEY)); } catch { return {}; } }
  function readGlobal() { try { return pick(parse(GM_getValue(GLOBAL_KEY, "{}"))); } catch { return {}; } }
  function apply() {
    const settings = { ...readLocal(), ...readGlobal() };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
    document.documentElement.classList.toggle("xiv-fl-launch-hidden", settings.launchHidden === true);
    window.dispatchEvent(new CustomEvent("flowlens:settings-updated", { detail: settings }));
    return settings;
  }
  // Save only explicit changes; a background tab cannot overwrite newer values.
  function sync(patch = {}) {
    const changed = pick(patch);
    if (Object.keys(changed).length) {
      try { GM_setValue(GLOBAL_KEY, JSON.stringify({ ...readGlobal(), ...changed })); } catch {}
    }
    return apply();
  }
  window.__flowLensApplyGlobalSettings = apply;
  window.__flowLensSyncGlobalSettings = sync;
  apply();
  if (typeof GM_addValueChangeListener === "function") {
    GM_addValueChangeListener(GLOBAL_KEY, (_key, _old, _next, remote) => { if (remote) apply(); });
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") apply(); });
})();
