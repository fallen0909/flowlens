// ==UserScript==
// @name         瀑光 FlowLens 全局设置同步
// @namespace    local.flowlens.settings
// @version      1.2.7
// @description  让隐藏入口图标、主题、列数、自动滚动速度等设置在所有网站共用一份。
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  if (window.__flowLensGlobalSettings) return;
  window.__flowLensGlobalSettings = true;

  const SETTINGS_KEY = "flowlens-settings-v2";
  const GLOBAL_KEY = "flowlens-global-settings-v2";
  const SYNC_KEYS = ["launchHidden", "launchCompact", "autoFullscreen", "videoPreview", "theme", "columns", "autoScrollSpeed"];
  let saveTimer = 0;

  function safeJsonParse(text) {
    try { return JSON.parse(text || "{}") || {}; } catch { return {}; }
  }

  function readLocalSettings() {
    return safeJsonParse(localStorage.getItem(SETTINGS_KEY) || "{}");
  }

  function writeLocalSettings(settings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings || {})); } catch { /* ignore */ }
  }

  function pick(settings) {
    const result = {};
    SYNC_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(settings || {}, key)) result[key] = settings[key];
    });
    return result;
  }

  function readGlobalSettings() {
    try { return safeJsonParse(GM_getValue(GLOBAL_KEY, "{}")); } catch { return {}; }
  }

  function writeGlobalSettings(settings) {
    try { GM_setValue(GLOBAL_KEY, JSON.stringify(pick(settings || {}))); } catch { /* ignore */ }
  }

  function applyLaunchVisibility(settings) {
    document.documentElement.classList.toggle("xiv-fl-launch-hidden", settings && settings.launchHidden === true);
  }

  function applyGlobalToThisSite() {
    const global = readGlobalSettings();
    const local = readLocalSettings();
    const merged = { ...local, ...pick(global) };
    writeLocalSettings(merged);
    applyLaunchVisibility(merged);
    return merged;
  }

  function syncThisSiteToGlobalSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const local = readLocalSettings();
      writeGlobalSettings(local);
      applyLaunchVisibility(local);
    }, 120);
  }

  function bindUiChanges() {
    document.addEventListener("change", (event) => {
      const target = event.target;
      if (!target || !target.closest || !target.closest("#xiv-root [data-setting], #xiv-root [data-fl-setting]")) return;
      setTimeout(syncThisSiteToGlobalSoon, 80);
    }, true);
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!target || !target.closest || !target.closest("#xiv-root [data-fl-stepper], #xiv-root [data-xiv]")) return;
      setTimeout(syncThisSiteToGlobalSoon, 160);
    }, true);
  }

  applyGlobalToThisSite();
  bindUiChanges();
  setInterval(() => applyLaunchVisibility(readGlobalSettings()), 1200);
})();
