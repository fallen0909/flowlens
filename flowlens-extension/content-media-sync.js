(() => {
  if (window.__flowLensMediaSyncPatch) return;
  window.__flowLensMediaSyncPatch = true;

  const VERSION = "1.4.27";
  const FILTER_ORDER = ["all", "image", "video"];
  const FILTER_TEXT = { all: "全部", image: "图片", video: "视频" };
  const FILTER_KEY = "flowlens-media-filter-v1";
  const LEGACY_FILTER_KEY = "flowlens-media-filter-v2";
  const SPEED_KEY = "flowlens-lightbox-slideshow-delay-v1";
  const SETTINGS_KEY = "flowlens-settings-v2";
  const SPEED_OPTIONS = [800, 1200, 1800, 2400, 3200];
  const DEFAULT_DELAY = 1200;

  let currentMode = localStorage.getItem(FILTER_KEY) || localStorage.getItem(LEGACY_FILTER_KEY) || "all";
  if (!FILTER_ORDER.includes(currentMode)) currentMode = "all";
  function readSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch { return {}; }
  }

  function writeSettings(patch) {
    const next = { ...readSettings(), ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
    try { chrome?.storage?.local?.set?.({ [SETTINGS_KEY]: next }); } catch {}
    try { window.__flowLensSyncGlobalSettings?.(); } catch {}
    return next;
  }

  function readSlideshowDelay() {
    const settings = readSettings();
    const stored = Number(settings.lightboxAutoDelay || 0);
    if (SPEED_OPTIONS.includes(stored)) return stored;
    try {
      const legacy = Number(localStorage.getItem(SPEED_KEY) || 0);
      if (SPEED_OPTIONS.includes(legacy)) return legacy;
    } catch {}
    return DEFAULT_DELAY;
  }

  function writeSlideshowDelay(value) {
    writeSettings({ lightboxAutoDelay: value });
    try { localStorage.setItem(SPEED_KEY, String(value)); } catch {}
  }

  let slideshowDelay = readSlideshowDelay();
  if (!SPEED_OPTIONS.includes(slideshowDelay)) slideshowDelay = DEFAULT_DELAY;
  let slideshowTimer = 0;
  let slideshowActive = false;
  let lightboxObserver = null;
  let lightboxObserverTarget = null;
  let refreshTimer = 0;
  let bootTimer = 0;

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { return root()?.querySelector("#xiv-lightbox"); }
  function filterSelect() { return root()?.querySelector('#xiv-topbar .xiv-select[data-xiv="filter"]'); }
  function isLightboxOpen() { return lightbox()?.dataset.active === "true"; }
  function coreApi() { return window.__flowLensControl || null; }
  function nativeSlideshowOwnsButton() { return !!window.__flowLensSlideshowNativePatch; }

  function liveFilter() {
    const apiValue = coreApi()?.getMediaFilter?.();
    if (FILTER_ORDER.includes(apiValue)) return apiValue;
    const selectValue = filterSelect()?.value;
    if (FILTER_ORDER.includes(selectValue)) return selectValue;
    const stored = localStorage.getItem(FILTER_KEY) || localStorage.getItem(LEGACY_FILTER_KEY);
    return FILTER_ORDER.includes(stored) ? stored : "all";
  }

  function ensureStyle() {
    if (document.getElementById("xiv-media-sync-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-media-sync-style";
    style.textContent = `
      #xiv-root .xiv-media-switch { display: none !important; }
      #xiv-root .fl-top-filter-btn { display: inline-grid !important; place-items: center !important; align-items: center !important; justify-content: center !important; padding: 0 !important; font-size: 0 !important; letter-spacing: 0 !important; }
      #xiv-root .fl-top-filter-btn svg { width: 23px; height: 23px; display: block; pointer-events: none; margin: 0 auto; }
      #xiv-root .fl-version-row { display: flex; align-items: center; justify-content: space-between; min-height: 30px; padding: 0 0 10px; margin: -4px 0 4px; border-bottom: 1px solid rgba(0,0,0,.08); color: rgba(0,0,0,.58); font: 750 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      #xiv-root[data-theme="dark"] .fl-version-row, #xiv-root:not([data-theme="light"]) .fl-version-row { border-bottom-color: rgba(255,255,255,.12); color: rgba(255,255,255,.66); }
      #xiv-root .fl-version-row strong { color: inherit; font-weight: 900; }
      #xiv-root .fl-slideshow-speed { min-width: 120px; }
      #xiv-root .xiv-lightbox-slideshow { position: fixed; right: 118px; top: 18px; z-index: 2147483647; width: 42px; height: 42px; border-radius: 999px; border: 1px solid rgba(255,255,255,.26); background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.22), rgba(18,18,20,.72)); color: #fff; display: none; place-items: center; pointer-events: auto; cursor: pointer; padding: 0; box-shadow: 0 12px 30px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.18); backdrop-filter: blur(12px); }
      #xiv-root[data-fl-lightbox="true"] .xiv-lightbox-slideshow { display: grid; }
      #xiv-root .xiv-lightbox-slideshow[data-active="true"] { color: #111; background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.95), rgba(255,255,255,.76)); border-color: rgba(255,255,255,.7); }
      #xiv-root .xiv-lightbox-slideshow svg { width: 20px; height: 20px; display: block; }
      @media (max-width: 820px) {
        #xiv-root .xiv-panel[data-panel="settings"] { position: fixed !important; top: max(54px, calc(env(safe-area-inset-top, 0px) + 48px)) !important; right: max(8px, env(safe-area-inset-right, 0px)) !important; left: auto !important; bottom: auto !important; width: min(356px, calc(100vw - 16px)) !important; max-width: calc(100vw - 16px) !important; height: auto !important; max-height: min(68vh, calc(100vh - 74px - env(safe-area-inset-bottom, 0px))) !important; padding: 10px !important; border-radius: 12px !important; overflow-y: auto !important; overscroll-behavior: contain !important; }
        #xiv-root .xiv-panel[data-panel="settings"] h3 { font-size: 18px !important; margin: 0 0 6px !important; line-height: 1.2 !important; }
        #xiv-root .xiv-panel[data-panel="settings"] .xiv-setting-row { min-height: 42px !important; padding: 7px 0 !important; gap: 10px !important; font-size: 14px !important; line-height: 1.25 !important; }
        #xiv-root .xiv-panel[data-panel="settings"] .xiv-setting-row > span { font-size: 14px !important; font-weight: 800 !important; }
        #xiv-root .xiv-panel[data-panel="settings"] input[type="checkbox"] { width: 24px !important; height: 24px !important; }
        #xiv-root .xiv-panel[data-panel="settings"] .xiv-select { min-height: 38px !important; padding: 0 32px 0 12px !important; border-radius: 19px !important; font-size: 14px !important; font-weight: 850 !important; }
        #xiv-root .xiv-panel[data-panel="settings"] button { width: 40px !important; height: 40px !important; min-width: 40px !important; }
        #xiv-root .xiv-panel[data-panel="settings"] small { display: block !important; margin-top: 6px !important; font-size: 11px !important; line-height: 1.35 !important; opacity: .66 !important; }
        #xiv-root .fl-version-row { min-height: 26px !important; padding-bottom: 8px !important; margin-bottom: 4px !important; font-size: 12px !important; }
        #xiv-root .xiv-lightbox-slideshow { right: 118px; top: 18px; width: 42px; height: 42px; }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function filterIcon(mode) {
    if (mode === "image") return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="m4 15 4.2-4.2a2 2 0 0 1 2.8 0L16 16"/><path d="m14 14 1.2-1.2a2 2 0 0 1 2.8 0L20 15"/><circle cx="15.5" cy="9.5" r="1.2"/></svg>';
    if (mode === "video") return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="6" width="12" height="12" rx="2"/><path d="m16 10 4-2.5v9L16 14"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.4"/><rect x="14" y="4" width="6" height="6" rx="1.4"/><rect x="4" y="14" width="6" height="6" rx="1.4"/><rect x="14" y="14" width="6" height="6" rx="1.4"/></svg>';
  }

  function setFilter(mode) {
    if (!FILTER_ORDER.includes(mode)) mode = "all";
    currentMode = mode;
    try {
      localStorage.setItem(FILTER_KEY, mode);
      localStorage.setItem(LEGACY_FILTER_KEY, mode);
    } catch {}
    coreApi()?.setMediaFilter?.(mode);
    const select = filterSelect();
    if (select) {
      select.value = mode;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    document.querySelectorAll('[data-fl-setting="mediaFilter"]').forEach((node) => {
      node.value = mode;
    });
    [0, 80, 180].forEach((delay) => setTimeout(() => {
      coreApi()?.setMediaFilter?.(mode);
    }, delay));
    updateTopFilterButton();
  }

  function cycleFilter() {
    currentMode = liveFilter();
    const next = FILTER_ORDER[(FILTER_ORDER.indexOf(currentMode) + 1 + FILTER_ORDER.length) % FILTER_ORDER.length];
    setFilter(next);
  }

  function ensureTopFilterButton() {
    const button = root()?.querySelector('[data-xiv="top"]');
    if (!button) return;
    button.classList.add("fl-top-filter-btn");
    if (button.dataset.flFilterBound !== "true") {
      button.dataset.flFilterBound = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        cycleFilter();
      }, true);
    }
    updateTopFilterButton();
  }

  function updateTopFilterButton() {
    const button = root()?.querySelector('[data-xiv="top"]');
    if (!button) return;
    currentMode = liveFilter();
    button.title = `切换图/视频：当前${FILTER_TEXT[currentMode]}`;
    button.setAttribute("aria-label", button.title);
    button.innerHTML = filterIcon(currentMode);
  }

  function speedLabel(ms) {
    if (ms <= 800) return "极速 0.8秒";
    if (ms <= 1200) return "默认 1.2秒";
    if (ms <= 1800) return "较快 1.8秒";
    if (ms <= 2400) return "普通 2.4秒";
    return "慢速 3.2秒";
  }

  function setSlideshowDelay(ms) {
    const next = SPEED_OPTIONS.includes(Number(ms)) ? Number(ms) : DEFAULT_DELAY;
    slideshowDelay = next;
    writeSlideshowDelay(next);
    const select = root()?.querySelector(".fl-slideshow-speed");
    if (select) select.value = String(next);
    if (slideshowActive) restartSlideshowTimer();
  }

  function ensureSettingsRows() {
    const panel = root()?.querySelector('[data-panel="settings"]');
    if (!panel) return;
    let versionRow = panel.querySelector(".fl-version-row");
    if (!versionRow) {
      versionRow = document.createElement("div");
      versionRow.className = "fl-version-row";
      const h3 = panel.querySelector("h3");
      if (h3?.nextSibling) panel.insertBefore(versionRow, h3.nextSibling);
      else panel.prepend(versionRow);
    }
    versionRow.innerHTML = `<span>瀑光版本</span><strong>v${VERSION}</strong>`;

    let speedRow = panel.querySelector(".fl-slideshow-speed-row");
    if (!speedRow) {
      speedRow = document.createElement("label");
      speedRow.className = "xiv-setting-row fl-slideshow-speed-row";
      speedRow.innerHTML = `<span>大图切换速度</span><select class="xiv-select fl-slideshow-speed"></select>`;
      const autoScrollRow = [...panel.querySelectorAll(".xiv-setting-row")].find((row) => /自动滚动速度/.test(row.textContent || ""));
      if (autoScrollRow?.nextSibling) panel.insertBefore(speedRow, autoScrollRow.nextSibling);
      else panel.appendChild(speedRow);
      speedRow.querySelector("select")?.addEventListener("change", (event) => setSlideshowDelay(event.target.value));
    }
    const select = speedRow.querySelector("select");
    if (select && !select.options.length) {
      SPEED_OPTIONS.forEach((ms) => {
        const option = document.createElement("option");
        option.value = String(ms);
        option.textContent = speedLabel(ms);
        select.appendChild(option);
      });
    }
    if (select) select.value = String(slideshowDelay);
  }

  function slideshowIcon() {
    return slideshowActive
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="5" width="3.8" height="14" rx="1.2"/><rect x="13.2" y="5" width="3.8" height="14" rx="1.2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.2-6.2c.6-.4.6-1.4 0-1.8L9.6 4.9C8.9 4.5 8 5 8 5.8Z"/></svg>';
  }

  function ensureSlideshowButton() {
    const app = root();
    if (!app) return;
    let button = app.querySelector(".xiv-lightbox-slideshow");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "xiv-lightbox-slideshow";
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
      }, true);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        toggleSlideshow();
      }, true);
      app.appendChild(button);
    }
    const open = isLightboxOpen();
    app.dataset.flLightbox = open ? "true" : "false";
    if (nativeSlideshowOwnsButton()) {
      if (slideshowActive) stopSlideshow(false);
      return;
    }
    if (!open) {
      stopSlideshow(false);
      return;
    }
    button.dataset.active = slideshowActive ? "true" : "false";
    button.title = slideshowActive ? "暂停大图自动切换" : `开始大图自动切换（${speedLabel(slideshowDelay)}）`;
    button.setAttribute("aria-label", button.title);
    button.innerHTML = slideshowIcon();
  }

  function clickNextInLightbox() {
    const box = lightbox();
    if (!box || box.dataset.active !== "true") {
      stopSlideshow(false);
      return;
    }
    const before = box.innerHTML;
    const arrow = box.querySelector('.xiv-lightbox-arrow[data-side="right"]');
    if (arrow) arrow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    setTimeout(() => {
      if (box.dataset.active !== "true") return;
      if (box.innerHTML === before) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
      }
      setTimeout(checkLightbox, 120);
    }, 120);
  }

  function restartSlideshowTimer() {
    clearInterval(slideshowTimer);
    slideshowTimer = window.setInterval(clickNextInLightbox, slideshowDelay);
    ensureSlideshowButton();
  }

  function startSlideshow() {
    if (slideshowActive) return;
    slideshowActive = true;
    restartSlideshowTimer();
  }

  function stopSlideshow(update = true) {
    slideshowActive = false;
    clearInterval(slideshowTimer);
    slideshowTimer = 0;
    if (update) ensureSlideshowButton();
  }

  function toggleSlideshow() {
    if (slideshowActive) stopSlideshow();
    else startSlideshow();
  }

  function checkLightbox() {
    const app = root();
    const open = isLightboxOpen();
    if (app) app.dataset.flLightbox = open ? "true" : "false";
    if (!open) stopSlideshow(false);
    ensureSlideshowButton();
  }

  function ensureLightboxObserver() {
    const box = lightbox();
    if (!box || box === lightboxObserverTarget) return;
    lightboxObserver?.disconnect?.();
    lightboxObserverTarget = box;
    lightboxObserver = new MutationObserver(() => scheduleRefresh());
    lightboxObserver.observe(box, { childList: true, subtree: false, attributes: true, attributeFilter: ["data-active"] });
  }

  function refreshAll() {
    ensureStyle();
    document.querySelectorAll(".xiv-media-switch").forEach((node) => node.remove());
    ensureTopFilterButton();
    ensureSettingsRows();
    ensureSlideshowButton();
    ensureLightboxObserver();
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshAll, 140);
  }

  function boot() {
    refreshAll();
    clearTimeout(bootTimer);
    if (!root()) bootTimer = setTimeout(boot, 500);
  }

  document.addEventListener("click", () => setTimeout(checkLightbox, 120), true);
  document.addEventListener("keydown", () => setTimeout(checkLightbox, 120), true);
  document.addEventListener("fullscreenchange", scheduleRefresh, true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
