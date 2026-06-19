// ==UserScript==
// @name         瀑光 FlowLens 优化补丁
// @namespace    local.flowlens.patch
// @version      1.2.3
// @description  手机 Edge / Tampermonkey 版补丁：隐藏入口、精简工具栏、修复筛选、补齐设置项、优化移动端切换动画。
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  if (window.__flowLensUxPatch) return;
  window.__flowLensUxPatch = true;

  const SETTINGS_KEY = "flowlens-settings-v2";
  const FILTER_KEY = "flowlens-media-filter-v1";
  const KEEP_ACTIONS = new Set(["download", "auto", "prev-set", "next-set", "top", "settings", "close"]);
  const VIDEO_RE = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
  let mutationTimer = 0;
  let lightboxObserver = null;
  let lastSwitchDirection = "fade";
  let swipeStart = null;

  const css = `
    html.xiv-active,
    html.xiv-active body { margin: 0 !important; padding: 0 !important; background: #000 !important; overscroll-behavior: none !important; }
    #xiv-root { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100dvh !important; max-height: 100dvh !important; overflow: hidden !important; background: #050505 !important; transform: translateZ(0); }
    #xiv-root[data-theme="light"] { background: #f4f4f1 !important; color: #141414 !important; }
    @supports not (height: 100dvh) { #xiv-root { height: 100vh !important; max-height: 100vh !important; } }
    #xiv-root::before { content: ""; position: fixed; left: 0; right: 0; top: 0; height: max(env(safe-area-inset-top, 0px), 1px); background: #050505; z-index: 2; pointer-events: none; }
    #xiv-root[data-theme="light"]::before { background: #f4f4f1; }
    #xiv-stage { inset: 0 !important; width: 100% !important; height: 100% !important; box-sizing: border-box !important; padding-top: calc(54px + env(safe-area-inset-top, 0px)) !important; padding-right: max(6px, env(safe-area-inset-right, 0px)) !important; padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important; padding-left: max(6px, env(safe-area-inset-left, 0px)) !important; background: transparent !important; }
    #xiv-topbar { top: 0 !important; padding-top: calc(8px + env(safe-area-inset-top, 0px)) !important; background: linear-gradient(to bottom, rgba(0,0,0,.9), rgba(0,0,0,.36), rgba(0,0,0,0)) !important; }
    #xiv-root[data-theme="light"] #xiv-topbar { background: linear-gradient(to bottom, rgba(244,244,241,.92), rgba(244,244,241,.45), rgba(244,244,241,0)) !important; }
    #xiv-topbar [data-xiv]:not([data-xiv="download"]):not([data-xiv="auto"]):not([data-xiv="prev-set"]):not([data-xiv="next-set"]):not([data-xiv="top"]):not([data-xiv="settings"]):not([data-xiv="close"]), #xiv-topbar .xiv-select[data-xiv="filter"] { display: none !important; }
    #xiv-topbar .xiv-actions { gap: 8px !important; flex-wrap: nowrap !important; }
    html.xiv-fl-launch-hidden #xiv-launch { display: none !important; }
    .xiv-fl-filter-select { height: 34px; min-width: 108px; border-radius: 999px; border: 1px solid rgba(255,255,255,.18); background: rgba(18,18,20,.72); color: #fff; padding: 0 28px 0 12px; font: 800 13px/1 system-ui, sans-serif; }
    #xiv-root[data-theme="light"] .xiv-fl-filter-select { background: rgba(255,255,255,.86); color: #151515; border-color: rgba(0,0,0,.12); }
    .xiv-fl-stepper { display: inline-flex; align-items: center; gap: 8px; min-height: 34px; }
    .xiv-fl-stepper button { width: 34px; height: 34px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; background: rgba(18,18,20,.72); color: #fff; font: 900 18px/1 system-ui, sans-serif; cursor: pointer; }
    .xiv-fl-stepper strong { min-width: 46px; text-align: center; font: 850 13px/1 system-ui, sans-serif; }
    #xiv-root[data-theme="light"] .xiv-fl-stepper button { background: rgba(255,255,255,.86); color: #151515; border-color: rgba(0,0,0,.12); }
    #xiv-root [data-panel="settings"] small { display: none !important; }
    #xiv-lightbox img, #xiv-lightbox video, #xiv-lightbox iframe, #xiv-lightbox .xiv-video-frame { will-change: transform, opacity; backface-visibility: hidden; }
    #xiv-lightbox .xiv-fl-media-anim { animation-duration: 280ms; animation-timing-function: cubic-bezier(.22,.61,.36,1); animation-fill-mode: both; }
    #xiv-lightbox[data-fl-dir="next-y"] .xiv-fl-media-anim { animation-name: xivFlNextY; }
    #xiv-lightbox[data-fl-dir="prev-y"] .xiv-fl-media-anim { animation-name: xivFlPrevY; }
    #xiv-lightbox[data-fl-dir="next-x"] .xiv-fl-media-anim { animation-name: xivFlNextX; }
    #xiv-lightbox[data-fl-dir="prev-x"] .xiv-fl-media-anim { animation-name: xivFlPrevX; }
    #xiv-lightbox[data-fl-dir="fade"] .xiv-fl-media-anim { animation-name: xivFlFade; }
    @keyframes xivFlNextY { from { opacity:.18; transform:translate3d(0,8vh,0) scale(.985); } to { opacity:1; transform:translate3d(0,0,0) scale(1); } }
    @keyframes xivFlPrevY { from { opacity:.18; transform:translate3d(0,-8vh,0) scale(.985); } to { opacity:1; transform:translate3d(0,0,0) scale(1); } }
    @keyframes xivFlNextX { from { opacity:.18; transform:translate3d(8vw,0,0) scale(.985); } to { opacity:1; transform:translate3d(0,0,0) scale(1); } }
    @keyframes xivFlPrevX { from { opacity:.18; transform:translate3d(-8vw,0,0) scale(.985); } to { opacity:1; transform:translate3d(0,0,0) scale(1); } }
    @keyframes xivFlFade { from { opacity:.25; transform:scale(.985); } to { opacity:1; transform:scale(1); } }
    @media (max-width: 820px) { #xiv-topbar { justify-content: space-between !important; align-items:flex-start !important; gap: 6px !important; padding-right: max(8px, env(safe-area-inset-right, 0px)) !important; padding-left: max(8px, env(safe-area-inset-left, 0px)) !important; } #xiv-topbar .xiv-pill { display: inline-flex !important; } #xiv-topbar .xiv-actions { flex-wrap: wrap !important; justify-content:flex-end !important; max-width: min(268px, 62vw) !important; gap: 5px !important; } #xiv-topbar .xiv-btn { min-width: 36px !important; width: 36px !important; height: 36px !important; padding: 0 !important; } #xiv-topbar .xiv-btn span { display: none !important; } #xiv-stage { padding-top: calc(58px + env(safe-area-inset-top, 0px)) !important; } #xiv-lightbox img, #xiv-lightbox video { max-width: 100vw !important; max-height: 100dvh !important; } }
  `;

  function injectStyle() { if (document.getElementById("xiv-fl-ux-patch-style")) return; const style = document.createElement("style"); style.id = "xiv-fl-ux-patch-style"; style.textContent = css; document.documentElement.appendChild(style); }
  function readSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch { return {}; } }
  function saveSettings(patch) { const settings = { ...readSettings(), ...patch }; try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } }
  function launchHidden() { return readSettings().launchHidden === true; }
  function applyLaunchVisibility() { document.documentElement.classList.toggle("xiv-fl-launch-hidden", launchHidden()); }
  function getStoredFilter() { const nativeSelect = document.querySelector('#xiv-root [data-xiv="filter"]'); const value = localStorage.getItem(FILTER_KEY) || (nativeSelect ? nativeSelect.value : "all") || "all"; return ["all", "image", "video"].includes(value) ? value : "all"; }
  function mediaTypeOfTile(tile) { const url = (tile && tile.dataset && tile.dataset.url) || ""; if (VIDEO_RE.test(url)) return "video"; if (tile && tile.querySelector && tile.querySelector("video, .xiv-video-mark")) return "video"; return "image"; }
  function applyFilterDom(value = getStoredFilter()) { const tiles = Array.from(document.querySelectorAll("#xiv-grid .xiv-tile")); if (!tiles.length) return; let imageCount = 0; let videoCount = 0; let visible = 0; for (const tile of tiles) { const type = mediaTypeOfTile(tile); if (type === "video") videoCount += 1; else imageCount += 1; tile.dataset.flMediaType = type; const show = value === "all" || value === type; tile.hidden = !show; tile.style.display = show ? "" : "none"; if (show) visible += 1; } const counter = document.getElementById("xiv-counter"); if (counter) { if (value === "image") counter.textContent = `图片 ${visible}/${imageCount}`; else if (value === "video") counter.textContent = `视频 ${visible}/${videoCount}`; else counter.textContent = `${tiles.length} 张`; } }
  function setStoredFilter(value) { const next = ["all", "image", "video"].includes(value) ? value : "all"; try { localStorage.setItem(FILTER_KEY, next); } catch { /* ignore */ } const nativeSelect = document.querySelector('#xiv-root [data-xiv="filter"]'); if (nativeSelect && nativeSelect.value !== next) { nativeSelect.value = next; nativeSelect.dispatchEvent(new Event("change", { bubbles: true })); } [0, 80, 180].forEach((delay) => setTimeout(() => applyFilterDom(next), delay)); syncAddonControls(); }
  function ensureToolbarCompact() { document.querySelectorAll("#xiv-topbar [data-xiv]").forEach((el) => { const show = KEEP_ACTIONS.has(el.dataset.xiv); el.hidden = !show; el.style.display = show ? "" : "none"; }); const filter = document.querySelector('#xiv-topbar .xiv-select[data-xiv="filter"]'); if (filter) { filter.hidden = true; filter.style.display = "none"; } }
  function createSettingRow(labelText, control, id) { const label = document.createElement("label"); label.className = "xiv-setting-row"; label.dataset.flAddon = id || "true"; const span = document.createElement("span"); span.textContent = labelText; label.append(span, control); return label; }
  function createStepper(id, minusAction, plusAction) { const box = document.createElement("span"); box.className = "xiv-fl-stepper"; box.dataset.flStepper = id; box.innerHTML = `<button type="button" data-fl-minus>−</button><strong data-fl-value>--</strong><button type="button" data-fl-plus>+</button>`; box.querySelector("[data-fl-minus]").addEventListener("click", (event) => { event.preventDefault(); document.querySelector(`#xiv-root [data-xiv="${minusAction}"]`)?.click(); setTimeout(refreshSteppers, 120); }); box.querySelector("[data-fl-plus]").addEventListener("click", (event) => { event.preventDefault(); document.querySelector(`#xiv-root [data-xiv="${plusAction}"]`)?.click(); setTimeout(refreshSteppers, 120); }); return box; }
  function refreshSteppers() { const settings = readSettings(); const columns = Math.max(2, Math.min(8, Number(settings.columns || 3))); const speed = Math.max(1, Math.min(10, Number(settings.autoScrollSpeed || 3))); const colValue = document.querySelector('[data-fl-stepper="columns"] [data-fl-value]'); const speedValue = document.querySelector('[data-fl-stepper="speed"] [data-fl-value]'); if (colValue) colValue.textContent = `${columns}列`; if (speedValue) speedValue.textContent = `${speed}档`; }
  function ensureSettingsAddons() { const panel = document.querySelector('#xiv-root [data-panel="settings"]'); if (!panel) return; panel.querySelectorAll("small").forEach((el) => el.remove()); if (panel.querySelector('[data-fl-addon="launch-hidden"]')) { refreshSteppers(); return; } const themeRow = panel.querySelector('[data-setting="theme"]')?.closest?.(".xiv-setting-row"); const insertBefore = themeRow || null; const columnsRow = createSettingRow("图片流列数", createStepper("columns", "less", "more"), "columns"); const speedRow = createSettingRow("自动滚动速度", createStepper("speed", "slower", "faster"), "speed"); const hideInput = document.createElement("input"); hideInput.type = "checkbox"; hideInput.dataset.flSetting = "launchHidden"; hideInput.checked = launchHidden(); hideInput.addEventListener("change", () => { saveSettings({ launchHidden: hideInput.checked }); applyLaunchVisibility(); syncAddonControls(); }); const hideRow = createSettingRow("隐藏入口图标（用 G 或 Alt+F 打开）", hideInput, "launch-hidden"); const filterSelect = document.createElement("select"); filterSelect.className = "xiv-fl-filter-select"; filterSelect.dataset.flSetting = "mediaFilter"; filterSelect.innerHTML = '<option value="all">全部</option><option value="image">只看图片</option><option value="video">只看视频</option>'; filterSelect.value = getStoredFilter(); filterSelect.addEventListener("change", () => setStoredFilter(filterSelect.value)); const filterRow = createSettingRow("图片流筛选", filterSelect, "media-filter"); panel.insertBefore(columnsRow, insertBefore); panel.insertBefore(speedRow, insertBefore); panel.insertBefore(hideRow, insertBefore); panel.insertBefore(filterRow, insertBefore); refreshSteppers(); }
  function syncAddonControls() { const hideInput = document.querySelector('[data-fl-setting="launchHidden"]'); if (hideInput) hideInput.checked = launchHidden(); const filterSelect = document.querySelector('[data-fl-setting="mediaFilter"]'); if (filterSelect) filterSelect.value = getStoredFilter(); refreshSteppers(); }
  function isTypingTarget(target) { return target && target.matches && target.matches("input, textarea, select, [contenteditable='true'], [contenteditable='']"); }
  function toggleViewerByPatch() { const root = document.getElementById("xiv-root"); if (root && root.dataset.active === "true") { const close = document.querySelector('#xiv-root [data-xiv="close"]'); if (close) close.click(); return; } const launch = document.getElementById("xiv-launch"); if (launch) launch.click(); }
  function closePanelsOnOutside(event) { const settingsPanel = document.querySelector('#xiv-root [data-panel="settings"]'); const diagnosticsPanel = document.querySelector('#xiv-root [data-panel="diagnostics"]'); if ((!settingsPanel || settingsPanel.dataset.open !== "true") && (!diagnosticsPanel || diagnosticsPanel.dataset.open !== "true")) return; if (event.target && event.target.closest && event.target.closest('[data-panel="settings"], [data-panel="diagnostics"], [data-xiv="settings"], [data-xiv="diag"]')) return; if (settingsPanel) settingsPanel.dataset.open = "false"; if (diagnosticsPanel) diagnosticsPanel.dataset.open = "false"; }
  function bindShortcuts() { document.addEventListener("pointerdown", closePanelsOnOutside, true); document.addEventListener("keydown", (event) => { if (isTypingTarget(event.target)) return; if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "f") { event.preventDefault(); event.stopPropagation(); toggleViewerByPatch(); } const lightbox = document.getElementById("xiv-lightbox"); if (lightbox && lightbox.dataset.active === "true") { if (event.key === "ArrowRight") lastSwitchDirection = "next-x"; else if (event.key === "ArrowLeft") lastSwitchDirection = "prev-x"; } }, true); document.addEventListener("wheel", (event) => { const lightbox = document.getElementById("xiv-lightbox"); if (!lightbox || lightbox.dataset.active !== "true" || !lightbox.contains(event.target)) return; const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX; if (Math.abs(delta) > 4) lastSwitchDirection = delta > 0 ? "next-y" : "prev-y"; }, true); document.addEventListener("pointerdown", (event) => { const lightbox = document.getElementById("xiv-lightbox"); if (!lightbox || lightbox.dataset.active !== "true" || !lightbox.contains(event.target)) return; if (event.target && event.target.closest && event.target.closest(".xiv-lightbox-fav, .xiv-lightbox-close, .xiv-lightbox-arrow")) return; swipeStart = { x: event.clientX, y: event.clientY }; }, true); document.addEventListener("pointerup", (event) => { if (!swipeStart) return; const dx = event.clientX - swipeStart.x; const dy = event.clientY - swipeStart.y; swipeStart = null; if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return; lastSwitchDirection = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "next-x" : "prev-x") : (dy < 0 ? "next-y" : "prev-y"); }, true); }
  function animateLightboxMedia() { const lightbox = document.getElementById("xiv-lightbox"); if (!lightbox || lightbox.dataset.active !== "true") return; const media = lightbox.querySelector(".xiv-video-frame, img, video, iframe"); if (!media) return; lightbox.dataset.flDir = lastSwitchDirection || "fade"; media.classList.remove("xiv-fl-media-anim"); void media.offsetWidth; media.classList.add("xiv-fl-media-anim"); setTimeout(() => media.classList.remove("xiv-fl-media-anim"), 340); lastSwitchDirection = "fade"; }
  function observeLightbox() { const lightbox = document.getElementById("xiv-lightbox"); if (!lightbox || lightbox.dataset.flObserved === "true") return; lightbox.dataset.flObserved = "true"; if (lightboxObserver && lightboxObserver.disconnect) lightboxObserver.disconnect(); lightboxObserver = new MutationObserver(() => requestAnimationFrame(animateLightboxMedia)); lightboxObserver.observe(lightbox, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "data-active"] }); }
  function applyAll() { injectStyle(); applyLaunchVisibility(); ensureToolbarCompact(); ensureSettingsAddons(); syncAddonControls(); observeLightbox(); applyFilterDom(getStoredFilter()); }
  function scheduleApplyAll() { clearTimeout(mutationTimer); mutationTimer = setTimeout(applyAll, 80); }

  injectStyle();
  bindShortcuts();
  applyAll();
  new MutationObserver(scheduleApplyAll).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("resize", () => applyFilterDom(getStoredFilter()), { passive: true });
})();
