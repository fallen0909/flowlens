(() => {
  if (window.__flowLensMediaSyncPatch) return;
  window.__flowLensMediaSyncPatch = true;

  const VERSION = "1.4.10";
  const VIDEO_RE = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
  const FILTER_ORDER = ["all", "image", "video"];
  const FILTER_SHORT = { all: "全", image: "图", video: "视" };
  const FILTER_TEXT = { all: "全部", image: "图片", video: "视频" };
  const SLIDESHOW_INTERVAL = 2800;
  const CONTROL_REFRESH_MS = 900;

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

  function isVideoUrl(url) {
    return VIDEO_RE.test(String(url || ""));
  }

  function root() {
    return document.getElementById("xiv-root");
  }

  function lightbox() {
    return root()?.querySelector("#xiv-lightbox");
  }

  function filterSelect() {
    return root()?.querySelector('#xiv-topbar .xiv-select[data-xiv="filter"]');
  }

  function ensureStyle() {
    if (document.getElementById("xiv-media-sync-style")) return;
    const style = document.createElement("style");
    style.id = "xiv-media-sync-style";
    style.textContent = `
      #xiv-root[data-fl-media-buttons="true"] #xiv-topbar .xiv-select[data-xiv="filter"] { display: none !important; }
      #xiv-root .xiv-media-switch { pointer-events: auto; display: inline-flex; align-items: center; gap: 5px; min-height: 38px; padding: 3px; border-radius: 999px; border: 1px solid rgba(255,255,255,.16); background: rgba(18,18,20,.74); backdrop-filter: blur(12px); }
      #xiv-root[data-theme="light"] .xiv-media-switch { background: rgba(255,255,255,.78); border-color: rgba(0,0,0,.12); }
      #xiv-root .xiv-media-switch button { height: 30px; min-width: 48px; padding: 0 10px; border: 0; border-radius: 999px; background: transparent; color: rgba(255,255,255,.76); font: 850 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; cursor: pointer; white-space: nowrap; }
      #xiv-root[data-theme="light"] .xiv-media-switch button { color: rgba(20,20,20,.72); }
      #xiv-root .xiv-media-switch button[data-active="true"] { background: rgba(255,255,255,.94); color: #111; box-shadow: 0 6px 18px rgba(0,0,0,.22); }
      #xiv-root[data-theme="light"] .xiv-media-switch button[data-active="true"] { background: #111; color: #fff; }
      #xiv-root .fl-top-filter-btn { font: 950 17px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; letter-spacing: 0 !important; }
      #xiv-root .fl-version-row { display: flex; align-items: center; justify-content: space-between; min-height: 34px; padding: 6px 0 12px; margin: -2px 0 6px; border-bottom: 1px solid rgba(0,0,0,.08); color: rgba(0,0,0,.58); font: 750 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      #xiv-root[data-theme="dark"] .fl-version-row, #xiv-root:not([data-theme="light"]) .fl-version-row { border-bottom-color: rgba(255,255,255,.12); color: rgba(255,255,255,.66); }
      #xiv-root .fl-version-row strong { color: inherit; font-weight: 900; }
      #xiv-lightbox .xiv-lightbox-slideshow { position: fixed; right: 118px; top: 18px; z-index: 6; width: 42px; height: 42px; border-radius: 999px; border: 1px solid rgba(255,255,255,.26); background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.22), rgba(18,18,20,.72)); color: #fff; display: grid; place-items: center; pointer-events: auto; cursor: pointer; padding: 0; box-shadow: 0 12px 30px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.18); backdrop-filter: blur(12px); font: 950 18px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      #xiv-lightbox .xiv-lightbox-slideshow[data-active="true"] { color: #111; background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.95), rgba(255,255,255,.76)); border-color: rgba(255,255,255,.7); }
      #xiv-lightbox .xiv-lightbox-slideshow svg { width: 20px; height: 20px; display: block; }
      @media (max-width: 820px) {
        #xiv-root .xiv-media-switch { gap: 3px; min-height: 34px; padding: 2px; }
        #xiv-root .xiv-media-switch button { height: 30px; min-width: 40px; padding: 0 8px; font-size: 12px; }
        #xiv-lightbox .xiv-lightbox-slideshow { right: 112px; top: 14px; width: 40px; height: 40px; }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function mediaCounts(force = false) {
    const now = Date.now();
    if (!force && now - countCacheAt < 1000) return countCache;
    const app = root();
    if (!app) return countCache;
    const tiles = app.querySelectorAll(".xiv-tile");
    let image = 0;
    let video = 0;
    tiles.forEach((tile) => {
      const url = tile.dataset.url || "";
      const hasVideo = isVideoUrl(url) || !!tile.querySelector("video");
      if (hasVideo) video += 1;
      else image += 1;
    });
    countCache = { all: image + video, image, video };
    countCacheAt = now;
    return countCache;
  }

  function buttonLabel(value, count) {
    if (value === "image") return `图片 ${count}`;
    if (value === "video") return `视频 ${count}`;
    return `全部 ${count}`;
  }

  function currentFilter() {
    return filterSelect()?.value || "all";
  }

  function setFilter(value) {
    const select = filterSelect();
    if (!select) return;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    refreshControls(true);
  }

  function cycleFilter() {
    const now = currentFilter();
    const next = FILTER_ORDER[(FILTER_ORDER.indexOf(now) + 1 + FILTER_ORDER.length) % FILTER_ORDER.length];
    setFilter(next);
  }

  function ensureMediaSwitch() {
    const app = root();
    const select = filterSelect();
    if (!app || !select) return;
    if (!app.querySelector(".xiv-media-switch")) {
      const group = document.createElement("div");
      group.className = "xiv-media-switch";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "媒体类型切换");
      group.innerHTML = `<button type="button" data-fl-filter="all">全部</button><button type="button" data-fl-filter="image">图片</button><button type="button" data-fl-filter="video">视频</button>`;
      group.addEventListener("click", (event) => {
        const button = event.target?.closest?.("button[data-fl-filter]");
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        setFilter(button.dataset.flFilter || "all");
      });
      select.parentElement?.insertBefore(group, select);
      select.addEventListener("change", () => refreshControls(true));
    }
    app.dataset.flMediaButtons = "true";
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
    const value = currentFilter();
    button.title = `切换图/视频：当前${FILTER_TEXT[value] || "全部"}`;
    button.setAttribute("aria-label", button.title);
    button.textContent = FILTER_SHORT[value] || "全";
  }

  function ensureVersionRow() {
    const panel = root()?.querySelector('[data-panel="settings"]');
    if (!panel) return;
    let row = panel.querySelector(".fl-version-row");
    if (!row) {
      row = document.createElement("div");
      row.className = "fl-version-row";
      const h3 = panel.querySelector("h3");
      if (h3?.nextSibling) panel.insertBefore(row, h3.nextSibling);
      else panel.prepend(row);
    }
    row.innerHTML = `<span>当前版本</span><strong>v${VERSION}</strong>`;
  }

  function refreshControls(forceCount = false) {
    const app = root();
    const select = filterSelect();
    const group = app?.querySelector(".xiv-media-switch");
    if (!app || !select || !group) return;
    const value = select.value || "all";
    const counts = mediaCounts(forceCount);
    group.querySelectorAll("button[data-fl-filter]").forEach((button) => {
      const mode = button.dataset.flFilter || "all";
      button.dataset.active = mode === value ? "true" : "false";
      button.textContent = buttonLabel(mode, counts[mode] || 0);
      button.title = mode === "all" ? "显示全部媒体" : mode === "image" ? "只显示图片" : "只显示视频";
    });
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
        if (p?.catch) {
          p.catch(() => {
            try {
              video.muted = true;
              video.setAttribute("muted", "");
              video.play?.().catch?.(() => {});
            } catch {}
          });
        }
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
      const run = () => {
        try {
          iframe.contentDocument?.querySelectorAll("video").forEach(playVideoElement);
        } catch {}
      };
      iframe.addEventListener("load", run, { once: true });
      setTimeout(run, 180);
    } catch {}
  }

  function isLightboxActive() {
    return lightbox()?.dataset.active === "true";
  }

  function slideshowIcon() {
    return slideshowActive
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="5" width="3.8" height="14" rx="1.2"/><rect x="13.2" y="5" width="3.8" height="14" rx="1.2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.2-6.2c.6-.4.6-1.4 0-1.8L9.6 4.9C8.9 4.5 8 5 8 5.8Z"/></svg>';
  }

  function ensureSlideshowButton() {
    const box = lightbox();
    if (!box || box.dataset.active !== "true") {
      stopSlideshow(false);
      return;
    }
    let button = box.querySelector(".xiv-lightbox-slideshow");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "xiv-lightbox-slideshow";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        toggleSlideshow();
      });
      box.appendChild(button);
    }
    button.dataset.active = slideshowActive ? "true" : "false";
    button.title = slideshowActive ? "暂停幻灯片自动切换" : "开始幻灯片自动切换";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = slideshowIcon();
  }

  function dispatchNextImage() {
    if (!isLightboxActive()) {
      stopSlideshow(false);
      return;
    }
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
    setTimeout(checkLightbox, 180);
  }

  function startSlideshow() {
    if (slideshowActive) return;
    slideshowActive = true;
    clearInterval(slideshowTimer);
    slideshowTimer = window.setInterval(dispatchNextImage, SLIDESHOW_INTERVAL);
    ensureSlideshowButton();
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
    const box = lightbox();
    const stateKey = `${box?.dataset.active || ""}|${box?.innerHTML?.length || 0}`;
    if (!box || box.dataset.active !== "true") {
      if (lastLightboxState) stopSlideshow(false);
      lastLightboxState = "";
      return;
    }
    if (stateKey === lastLightboxState) {
      ensureSlideshowButton();
      return;
    }
    lastLightboxState = stateKey;
    box.querySelectorAll("video").forEach(playVideoElement);
    box.querySelectorAll("iframe").forEach(playIframeVideo);
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
    ensureMediaSwitch();
    ensureTopFilterButton();
    ensureVersionRow();
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
    if (!pollTimer) {
      pollTimer = window.setInterval(() => refreshAll(false), CONTROL_REFRESH_MS);
    }
  }

  document.addEventListener("click", () => setTimeout(checkLightbox, 140), true);
  document.addEventListener("keydown", () => setTimeout(checkLightbox, 140), true);
  document.addEventListener("fullscreenchange", () => scheduleRefresh(false), true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
