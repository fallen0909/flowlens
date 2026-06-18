(() => {
  if (window.__flowLensMediaSyncPatch) return;
  window.__flowLensMediaSyncPatch = true;

  const VERSION = "1.4.12";
  const VIDEO_RE = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
  const FILTER_ORDER = ["all", "image", "video"];
  const FILTER_TEXT = { all: "全部", image: "图片", video: "视频" };
  const FILTER_KEY = "flowlens-media-filter-v2";
  const SPEED_KEY = "flowlens-lightbox-slideshow-delay-v1";
  const CONTROL_REFRESH_MS = 900;
  const SPEED_OPTIONS = [1200, 1800, 2800, 4000, 6000];

  let currentMode = localStorage.getItem(FILTER_KEY) || "all";
  if (!FILTER_ORDER.includes(currentMode)) currentMode = "all";
  let slideshowDelay = Number(localStorage.getItem(SPEED_KEY) || 2800);
  if (!SPEED_OPTIONS.includes(slideshowDelay)) slideshowDelay = 2800;
  let rootObserver = null;
  let rootObserverTarget = null;
  let lightboxObserver = null;
  let lightboxObserverTarget = null;
  let refreshTimer = 0;
  let pollTimer = 0;
  let countCacheAt = 0;
  let countCache = { all: 0, image: 0, video: 0 };
  let slideshowTimer = 0;
  let slideshowActive = false;
  let lastLightboxState = "";

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { return root()?.querySelector("#xiv-lightbox"); }
  function filterSelect() { return root()?.querySelector('#xiv-topbar .xiv-select[data-xiv="filter"]'); }
  function isVideoUrl(url) { return VIDEO_RE.test(String(url || "")); }

  function ensureStyle() {
    if (document.getElementById("xiv-media-sync-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-media-sync-style";
    style.textContent = `
      #xiv-root .xiv-media-switch { display: none !important; }
      #xiv-root[data-fl-filter="image"] .xiv-tile[data-fl-media="video"],
      #xiv-root[data-fl-filter="video"] .xiv-tile[data-fl-media="image"] { display: none !important; }
      #xiv-root .fl-top-filter-btn { font-size: 0 !important; letter-spacing: 0 !important; }
      #xiv-root .fl-top-filter-btn svg { width: 23px; height: 23px; display: block; pointer-events: none; }
      #xiv-root .fl-version-row { display: flex; align-items: center; justify-content: space-between; min-height: 34px; padding: 6px 0 12px; margin: -2px 0 6px; border-bottom: 1px solid rgba(0,0,0,.08); color: rgba(0,0,0,.58); font: 750 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      #xiv-root[data-theme="dark"] .fl-version-row, #xiv-root:not([data-theme="light"]) .fl-version-row { border-bottom-color: rgba(255,255,255,.12); color: rgba(255,255,255,.66); }
      #xiv-root .fl-version-row strong { color: inherit; font-weight: 900; }
      #xiv-root .fl-slideshow-speed { min-width: 132px; }
      #xiv-root .xiv-lightbox-slideshow { position: fixed; right: 118px; top: 18px; z-index: 2147483647; width: 42px; height: 42px; border-radius: 999px; border: 1px solid rgba(255,255,255,.26); background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.22), rgba(18,18,20,.72)); color: #fff; display: none; place-items: center; pointer-events: auto; cursor: pointer; padding: 0; box-shadow: 0 12px 30px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.18); backdrop-filter: blur(12px); }
      #xiv-root[data-fl-lightbox="true"] .xiv-lightbox-slideshow { display: grid; }
      #xiv-root .xiv-lightbox-slideshow[data-active="true"] { color: #111; background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.95), rgba(255,255,255,.76)); border-color: rgba(255,255,255,.7); }
      #xiv-root .xiv-lightbox-slideshow svg { width: 20px; height: 20px; display: block; }
      @media (max-width: 820px) { #xiv-root .xiv-lightbox-slideshow { right: 112px; top: 14px; width: 40px; height: 40px; } }
    `;
    document.documentElement.appendChild(style);
  }

  function mediaTypeForTile(tile) {
    const url = tile?.dataset?.url || "";
    return isVideoUrl(url) || !!tile?.querySelector?.("video") ? "video" : "image";
  }

  function markTiles() {
    const app = root();
    if (!app) return;
    app.querySelectorAll(".xiv-tile").forEach((tile) => {
      tile.dataset.flMedia = mediaTypeForTile(tile);
    });
  }

  function mediaCounts(force = false) {
    const now = Date.now();
    if (!force && now - countCacheAt < 1000) return countCache;
    const app = root();
    if (!app) return countCache;
    let image = 0;
    let video = 0;
    app.querySelectorAll(".xiv-tile").forEach((tile) => {
      const type = mediaTypeForTile(tile);
      tile.dataset.flMedia = type;
      if (type === "video") video += 1;
      else image += 1;
    });
    countCache = { all: image + video, image, video };
    countCacheAt = now;
    return countCache;
  }

  function setFilter(mode) {
    if (!FILTER_ORDER.includes(mode)) mode = "all";
    currentMode = mode;
    try { localStorage.setItem(FILTER_KEY, mode); } catch {}
    const app = root();
    if (app) app.dataset.flFilter = mode;
    const select = filterSelect();
    if (select) {
      select.value = mode;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    markTiles();
    refreshControls(true);
  }

  function cycleFilter() {
    const next = FILTER_ORDER[(FILTER_ORDER.indexOf(currentMode) + 1 + FILTER_ORDER.length) % FILTER_ORDER.length];
    setFilter(next);
  }

  function filterIcon(mode) {
    if (mode === "image") return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="m4 15 4.2-4.2a2 2 0 0 1 2.8 0L16 16"/><path d="m14 14 1.2-1.2a2 2 0 0 1 2.8 0L20 15"/><circle cx="15.5" cy="9.5" r="1.2"/></svg>';
    if (mode === "video") return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="6" width="12" height="12" rx="2"/><path d="m16 10 4-2.5v9L16 14"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.4"/><rect x="14" y="4" width="6" height="6" rx="1.4"/><rect x="4" y="14" width="6" height="6" rx="1.4"/><rect x="14" y="14" width="6" height="6" rx="1.4"/></svg>';
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
    const counts = mediaCounts(false);
    button.title = `切换图/视频：当前${FILTER_TEXT[currentMode]}｜全部${counts.all} 图片${counts.image} 视频${counts.video}`;
    button.setAttribute("aria-label", button.title);
    button.innerHTML = filterIcon(currentMode);
  }

  function speedLabel(ms) {
    if (ms <= 1200) return "很快 1.2秒";
    if (ms <= 1800) return "较快 1.8秒";
    if (ms <= 2800) return "正常 2.8秒";
    if (ms <= 4000) return "较慢 4秒";
    return "很慢 6秒";
  }

  function setSlideshowDelay(ms) {
    const next = SPEED_OPTIONS.includes(Number(ms)) ? Number(ms) : 2800;
    slideshowDelay = next;
    try { localStorage.setItem(SPEED_KEY, String(next)); } catch {}
    const select = root()?.querySelector(".fl-slideshow-speed");
    if (select) select.value = String(next);
    if (slideshowActive) restartSlideshowTimer();
  }

  function ensureVersionAndSpeedRows() {
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
    versionRow.innerHTML = `<span>当前版本</span><strong>v${VERSION}</strong>`;

    let speedRow = panel.querySelector(".fl-slideshow-speed-row");
    if (!speedRow) {
      speedRow = document.createElement("label");
      speedRow.className = "xiv-setting-row fl-slideshow-speed-row";
      speedRow.innerHTML = `<span>大图切换速度</span><select class="xiv-select fl-slideshow-speed"></select>`;
      const themeRow = panel.querySelector('[data-setting="theme"]')?.closest?.(".xiv-setting-row");
      if (themeRow?.nextSibling) panel.insertBefore(speedRow, themeRow.nextSibling);
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

  function refreshControls(forceCount = false) {
    const app = root();
    if (!app) return;
    app.dataset.flFilter = currentMode;
    mediaCounts(forceCount);
    updateTopFilterButton();
  }

  function playVideoElement(video) {
    if (!video || video.dataset.flAutoplayTouched === "true") return;
    video.dataset.flAutoplayTouched = "true";
    try {
      video.autoplay = true;
      video.controls = true;
      video.preload = "auto";
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      const run = () => {
        const p = video.play?.();
        if (p?.catch) p.catch(() => { try { video.muted = true; video.setAttribute("muted", ""); video.play?.().catch?.(() => {}); } catch {} });
      };
      if (video.readyState >= 2) run();
      else video.addEventListener("canplay", run, { once: true });
      setTimeout(run, 120);
    } catch {}
  }

  function playIframeVideo(iframe) {
    if (!iframe || iframe.dataset.flAutoplayTouched === "true") return;
    iframe.dataset.flAutoplayTouched = "true";
    try {
      iframe.allow = `${iframe.allow || ""}; autoplay; fullscreen; picture-in-picture`;
      const run = () => { try { iframe.contentDocument?.querySelectorAll("video").forEach(playVideoElement); } catch {} };
      iframe.addEventListener("load", run, { once: true });
      setTimeout(run, 180);
    } catch {}
  }

  function slideshowIcon() {
    return slideshowActive
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="5" width="3.8" height="14" rx="1.2"/><rect x="13.2" y="5" width="3.8" height="14" rx="1.2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.2-6.2c.6-.4.6-1.4 0-1.8L9.6 4.9C8.9 4.5 8 5 8 5.8Z"/></svg>';
  }

  function ensureSlideshowButton() {
    const app = root();
    const box = lightbox();
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
    const active = box?.dataset.active === "true";
    app.dataset.flLightbox = active ? "true" : "false";
    if (!active) {
      stopSlideshow(false);
      return;
    }
    button.dataset.active = slideshowActive ? "true" : "false";
    button.title = slideshowActive ? "暂停幻灯片自动切换" : `开始幻灯片自动切换（${speedLabel(slideshowDelay)}）`;
    button.setAttribute("aria-label", button.title);
    button.innerHTML = slideshowIcon();
  }

  function findRightArrow() {
    const box = lightbox();
    return box?.querySelector('.xiv-lightbox-arrow[data-side="right"]') || null;
  }

  function clickNextInLightbox() {
    const box = lightbox();
    if (!box || box.dataset.active !== "true") {
      stopSlideshow(false);
      return;
    }
    const arrow = findRightArrow();
    if (arrow) {
      arrow.click();
      setTimeout(checkLightbox, 180);
      return;
    }
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
    setTimeout(checkLightbox, 180);
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
    setTimeout(clickNextInLightbox, 120);
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
    const box = lightbox();
    const active = box?.dataset.active === "true";
    if (app) app.dataset.flLightbox = active ? "true" : "false";
    const stateKey = `${box?.dataset.active || ""}|${box?.innerHTML?.length || 0}`;
    if (!box || !active) {
      if (lastLightboxState) stopSlideshow(false);
      lastLightboxState = "";
      ensureSlideshowButton();
      return;
    }
    if (stateKey !== lastLightboxState) {
      lastLightboxState = stateKey;
      box.querySelectorAll("video").forEach(playVideoElement);
      box.querySelectorAll("iframe").forEach(playIframeVideo);
    }
    ensureSlideshowButton();
  }

  function ensureLightboxObserver() {
    const box = lightbox();
    if (!box || box === lightboxObserverTarget) return;
    lightboxObserver?.disconnect?.();
    lightboxObserverTarget = box;
    lightboxObserver = new MutationObserver(() => scheduleRefresh(false));
    lightboxObserver.observe(box, { childList: true, subtree: false, attributes: true, attributeFilter: ["data-active"] });
  }

  function ensureRootObserver() {
    const app = root();
    if (!app || app === rootObserverTarget) return;
    rootObserver?.disconnect?.();
    rootObserverTarget = app;
    rootObserver = new MutationObserver(() => scheduleRefresh(false));
    rootObserver.observe(app, { childList: true, subtree: false });
  }

  function refreshAll(forceCount = false) {
    ensureStyle();
    document.querySelectorAll(".xiv-media-switch").forEach((node) => node.remove());
    const app = root();
    if (app) app.dataset.flFilter = currentMode;
    markTiles();
    ensureTopFilterButton();
    ensureVersionAndSpeedRows();
    refreshControls(forceCount);
    ensureRootObserver();
    ensureLightboxObserver();
    checkLightbox();
  }

  function scheduleRefresh(forceCount = false) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshAll(forceCount), 160);
  }

  function start() {
    refreshAll(true);
    if (!pollTimer) pollTimer = window.setInterval(() => refreshAll(false), CONTROL_REFRESH_MS);
  }

  document.addEventListener("click", () => setTimeout(checkLightbox, 140), true);
  document.addEventListener("keydown", () => setTimeout(checkLightbox, 140), true);
  document.addEventListener("fullscreenchange", () => scheduleRefresh(false), true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
