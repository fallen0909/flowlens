(() => {
  if (window.__flowLensLightboxEnhancePatch) return;
  window.__flowLensLightboxEnhancePatch = true;
  window.__flowLensSlideshowNativePatch = true;

  const SETTINGS_KEY = "flowlens-settings-v2";
  const LEGACY_SPEED_KEY = "flowlens-lightbox-slideshow-delay-v1";
  const STYLE_ID = "flowlens-lightbox-enhance-style";
  const SPEED_OPTIONS = [800, 1200, 1800, 2400, 3200];
  const DEFAULT_DELAY = 1200;
  const ZOOM_MAP = { "1": 1.5, "2": 2, "3": 4, "0": 1 };

  let slideshowActive = false;
  let slideshowTimer = 0;
  let refreshTimer = 0;
  let observer = null;
  let lightboxObserver = null;
  let lightboxObserverTarget = null;
  let zoomFactor = 1;
  let zoomKey = "";
  let frameEnded = false;
  let frameUrl = "";
  let drag = null;

  function root() { return document.getElementById("xiv-root"); }
  function lightbox() { return root()?.querySelector("#xiv-lightbox"); }
  function isOpen() { return lightbox()?.dataset.active === "true"; }
  function coreApi() { return window.__flowLensControl || null; }

  function readSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch { return {}; }
  }

  function slideshowDelay() {
    const stored = Number(readSettings().lightboxAutoDelay || 0);
    if (SPEED_OPTIONS.includes(stored)) return stored;
    try {
      const legacy = Number(localStorage.getItem(LEGACY_SPEED_KEY) || 0);
      if (SPEED_OPTIONS.includes(legacy)) return legacy;
    } catch {}
    return DEFAULT_DELAY;
  }

  function speedLabel(ms) {
    if (ms <= 800) return "极速 0.8秒";
    if (ms <= 1200) return "默认 1.2秒";
    if (ms <= 1800) return "较快 1.8秒";
    if (ms <= 2400) return "普通 2.4秒";
    return "慢速 3.2秒";
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #xiv-root .xiv-lightbox-slideshow[data-fl-enhanced="true"] { display: grid !important; }
      #xiv-root .xiv-lightbox-slideshow[data-active="true"] { color: #111 !important; background: radial-gradient(circle at 32% 24%, rgba(255,255,255,.96), rgba(255,255,255,.78)) !important; border-color: rgba(255,255,255,.72) !important; }
      #xiv-lightbox[data-fl-shortcut-zoom="true"] { overflow: auto !important; align-items: flex-start !important; justify-content: flex-start !important; }
      #xiv-lightbox[data-fl-shortcut-zoom="true"] img,
      #xiv-lightbox[data-fl-shortcut-zoom="true"] video,
      #xiv-lightbox[data-fl-shortcut-zoom="true"] iframe[data-media-url],
      #xiv-lightbox[data-fl-shortcut-zoom="true"] .xiv-video-frame {
        max-width: none !important;
        max-height: none !important;
        object-fit: contain !important;
        cursor: grab !important;
        flex: 0 0 auto !important;
      }
      #xiv-lightbox[data-fl-shortcut-zoom="true"][data-fl-dragging="true"] img,
      #xiv-lightbox[data-fl-shortcut-zoom="true"][data-fl-dragging="true"] video,
      #xiv-lightbox[data-fl-shortcut-zoom="true"][data-fl-dragging="true"] iframe[data-media-url],
      #xiv-lightbox[data-fl-shortcut-zoom="true"][data-fl-dragging="true"] .xiv-video-frame { cursor: grabbing !important; }
      #xiv-lightbox .fl-zoom-hint {
        position: fixed; left: 50%; bottom: max(20px, env(safe-area-inset-bottom, 0px) + 18px); transform: translateX(-50%);
        z-index: 2147483647; padding: 8px 12px; border-radius: 999px;
        color: #fff; background: rgba(0,0,0,.58); backdrop-filter: blur(10px);
        font: 850 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none; opacity: 0; transition: opacity .16s ease;
      }
      #xiv-lightbox .fl-zoom-hint[data-show="true"] { opacity: 1; }
    `;
    document.documentElement.appendChild(style);
  }

  function ensureButton() {
    const app = root();
    if (!app) return null;
    let btn = app.querySelector(".xiv-lightbox-slideshow");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "xiv-lightbox-slideshow";
      app.appendChild(btn);
    }
    btn.dataset.flEnhanced = "true";
    return btn;
  }

  function slideshowIcon() {
    return slideshowActive
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="5" width="3.8" height="14" rx="1.2"/><rect x="13.2" y="5" width="3.8" height="14" rx="1.2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.2-6.2c.6-.4.6-1.4 0-1.8L9.6 4.9C8.9 4.5 8 5 8 5.8Z"/></svg>';
  }

  function updateButton() {
    const app = root();
    const open = isOpen();
    if (app) app.dataset.flLightbox = open ? "true" : "false";
    const btn = ensureButton();
    if (!btn) return;
    btn.dataset.active = slideshowActive ? "true" : "false";
    btn.style.display = open ? "grid" : "none";
    btn.title = slideshowActive ? "暂停大图自动切换" : `开始大图自动切换（${speedLabel(slideshowDelay())}）`;
    btn.setAttribute("aria-label", btn.title);
    btn.innerHTML = slideshowIcon();
  }

  function clearSlideshowTimer() {
    clearTimeout(slideshowTimer);
    slideshowTimer = 0;
  }

  function lightboxMedia() {
    return lightbox()?.querySelector("img, video, iframe[data-media-url], .xiv-video-frame") || null;
  }

  function currentVideo() {
    return lightbox()?.querySelector("video") || null;
  }

  function currentFrame() {
    return lightbox()?.querySelector("iframe[data-media-url], .xiv-video-frame") || null;
  }

  function mediaIdentity(media = lightboxMedia()) {
    if (!media) return "";
    return media.currentSrc || media.src || media.dataset?.mediaUrl || media.getAttribute?.("src") || media.getAttribute?.("srcdoc")?.slice(0, 80) || "";
  }

  function ensureVideoPlaying() {
    const video = currentVideo();
    if (!video) return false;
    if (!video.playsInline) video.playsInline = true;
    if (video.paused && !video.ended) {
      try {
        const promise = video.play();
        promise?.catch?.(() => {
          try {
            video.muted = true;
            video.play()?.catch?.(() => {});
          } catch {}
        });
      } catch {}
    }
    return true;
  }

  function videoStillRunning() {
    const video = currentVideo();
    if (video) {
      ensureVideoPlaying();
      const duration = Number(video.duration || 0);
      const current = Number(video.currentTime || 0);
      if (video.ended) return false;
      if (Number.isFinite(duration) && duration > 0) return current < duration - 0.35;
      return video.readyState < 2 || !video.paused;
    }
    const frame = currentFrame();
    if (frame) {
      const url = frame.dataset?.mediaUrl || mediaIdentity(frame);
      if (url && url !== frameUrl) {
        frameUrl = url;
        frameEnded = false;
      }
      return lightbox()?.dataset.flVideoEnded !== "true" && !frameEnded;
    }
    return false;
  }

  function goNext() {
    frameEnded = false;
    const api = coreApi();
    if (api?.showAdjacent?.(1)) return true;
    const box = lightbox();
    const arrow = box?.querySelector?.('.xiv-lightbox-arrow[data-side="right"]');
    if (arrow) {
      arrow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
    return false;
  }

  function scheduleSlideshow(wait = slideshowDelay()) {
    clearSlideshowTimer();
    if (!slideshowActive) return;
    slideshowTimer = window.setTimeout(slideshowTick, Math.max(250, Number(wait) || DEFAULT_DELAY));
    updateButton();
  }

  function slideshowTick() {
    if (!slideshowActive) return;
    if (!isOpen()) {
      stopSlideshow(false);
      return;
    }
    if (videoStillRunning()) {
      scheduleSlideshow(650);
      return;
    }
    goNext();
    window.setTimeout(() => {
      ensureVideoPlaying();
      if (zoomFactor > 1) applyZoom(zoomFactor, false);
      updateButton();
    }, 160);
    scheduleSlideshow(slideshowDelay());
  }

  function startSlideshow() {
    if (!isOpen()) return;
    slideshowActive = true;
    ensureVideoPlaying();
    scheduleSlideshow(videoStillRunning() ? 650 : slideshowDelay());
    updateButton();
  }

  function stopSlideshow(update = true) {
    slideshowActive = false;
    clearSlideshowTimer();
    if (update) updateButton();
  }

  function toggleSlideshow() {
    if (slideshowActive) stopSlideshow();
    else startSlideshow();
  }

  function ensureZoomHint(box = lightbox()) {
    if (!box) return null;
    let hint = box.querySelector(".fl-zoom-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "fl-zoom-hint";
      box.appendChild(hint);
    }
    return hint;
  }

  function showZoomHint(text) {
    const hint = ensureZoomHint();
    if (!hint) return;
    hint.textContent = text;
    hint.dataset.show = "true";
    clearTimeout(Number(hint.dataset.timer || 0));
    hint.dataset.timer = String(window.setTimeout(() => { hint.dataset.show = "false"; }, 900));
  }

  function resetZoomStyles(media = lightboxMedia()) {
    const box = lightbox();
    if (!box || !media) return;
    ["width", "height", "max-width", "max-height", "margin", "transform", "transform-origin"].forEach((prop) => media.style.removeProperty(prop));
    delete media.dataset.flZoomKey;
    delete media.dataset.flBaseWidth;
    delete media.dataset.flBaseHeight;
    delete box.dataset.flShortcutZoom;
    delete box.dataset.flZoomFactor;
    zoomKey = "";
  }

  function prepareBase(media) {
    const key = mediaIdentity(media);
    if (!media.dataset.flBaseWidth || media.dataset.flZoomKey !== key) {
      ["width", "height", "max-width", "max-height", "margin"].forEach((prop) => media.style.removeProperty(prop));
      const rect = media.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width || media.clientWidth || media.naturalWidth || media.videoWidth || 1));
      const height = Math.max(1, Math.round(rect.height || media.clientHeight || media.naturalHeight || media.videoHeight || 1));
      media.dataset.flBaseWidth = String(width);
      media.dataset.flBaseHeight = String(height);
      media.dataset.flZoomKey = key;
    }
  }

  function applyZoom(factor, notify = true) {
    const box = lightbox();
    const media = lightboxMedia();
    if (!box || box.dataset.active !== "true" || !media) return;
    const normalized = Number(factor) > 1 ? Number(factor) : 1;
    if (normalized === 1) {
      zoomFactor = 1;
      resetZoomStyles(media);
      if (notify) showZoomHint("已恢复适应屏幕");
      return;
    }
    const key = mediaIdentity(media);
    if (zoomKey && zoomKey !== key) {
      resetZoomStyles(media);
    }
    zoomKey = key;
    zoomFactor = normalized;
    prepareBase(media);
    const baseWidth = Number(media.dataset.flBaseWidth || 0) || 1;
    const baseHeight = Number(media.dataset.flBaseHeight || 0) || 1;
    media.style.setProperty("width", `${Math.round(baseWidth * normalized)}px`, "important");
    media.style.setProperty("height", `${Math.round(baseHeight * normalized)}px`, "important");
    media.style.setProperty("max-width", "none", "important");
    media.style.setProperty("max-height", "none", "important");
    media.style.setProperty("margin", "40px", "important");
    box.dataset.flShortcutZoom = "true";
    box.dataset.flZoomFactor = String(normalized);
    requestAnimationFrame(() => {
      const left = Math.max(0, Math.round((box.scrollWidth - box.clientWidth) / 2));
      const top = Math.max(0, Math.round((box.scrollHeight - box.clientHeight) / 2));
      box.scrollTo?.({ left, top, behavior: "auto" });
    });
    if (notify) showZoomHint(`已放大 ${normalized}×`);
  }

  function handleKeydown(event) {
    if (!isOpen()) return;
    const target = event.target;
    if (target?.matches?.("input, textarea, select, [contenteditable='true'], [contenteditable='']")) return;
    if (!(event.key in ZOOM_MAP) || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    applyZoom(ZOOM_MAP[event.key]);
  }

  function handleButtonEvent(event) {
    if (!event.target?.closest?.(".xiv-lightbox-slideshow")) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (event.type === "click") toggleSlideshow();
  }

  function handlePointerDown(event) {
    const box = lightbox();
    if (!box || box.dataset.active !== "true" || box.dataset.flShortcutZoom !== "true") return;
    if (!event.target?.closest?.("#xiv-lightbox img, #xiv-lightbox video, #xiv-lightbox iframe")) return;
    if (event.target?.closest?.(".xiv-lightbox-fav, .xiv-lightbox-close, .xiv-lightbox-arrow, .xiv-lightbox-slideshow")) return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop, moved: false };
    box.dataset.flDragging = "true";
    event.target?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function handlePointerMove(event) {
    const box = lightbox();
    if (!box || !drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
    box.scrollLeft = drag.left - dx;
    box.scrollTop = drag.top - dy;
    event.preventDefault();
    event.stopPropagation();
  }

  function handlePointerUp(event) {
    const box = lightbox();
    if (!drag || (event && drag.pointerId !== event.pointerId)) return;
    drag = null;
    if (box) delete box.dataset.flDragging;
  }

  function watchLightbox() {
    const box = lightbox();
    if (!box || box === lightboxObserverTarget) return;
    lightboxObserver?.disconnect?.();
    lightboxObserverTarget = box;
    lightboxObserver = new MutationObserver(() => scheduleRefresh(80));
    lightboxObserver.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "data-fl-video-ended"] });
  }

  function refresh() {
    installStyle();
    watchLightbox();
    if (!isOpen()) {
      stopSlideshow(false);
      zoomFactor = 1;
      zoomKey = "";
    } else if (zoomFactor > 1) {
      applyZoom(zoomFactor, false);
    }
    updateButton();
  }

  function scheduleRefresh(delay = 120) {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refresh, delay);
  }

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type !== "XIV_VIDEO_TIME") return;
    const url = String(message.url || "");
    if (url && url !== frameUrl) {
      frameUrl = url;
      frameEnded = false;
    }
    if (message.eventName === "ended") {
      frameEnded = true;
      if (slideshowActive) scheduleSlideshow(250);
    }
  });

  document.addEventListener("pointerdown", handleButtonEvent, true);
  document.addEventListener("click", handleButtonEvent, true);
  document.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("pointerdown", handlePointerDown, true);
  document.addEventListener("pointermove", handlePointerMove, true);
  document.addEventListener("pointerup", handlePointerUp, true);
  document.addEventListener("pointercancel", handlePointerUp, true);
  document.addEventListener("ended", (event) => {
    if (slideshowActive && event.target?.matches?.("#xiv-lightbox video")) scheduleSlideshow(250);
  }, true);
  document.addEventListener("change", (event) => {
    if (event.target?.matches?.(".fl-slideshow-speed") && slideshowActive) scheduleSlideshow(slideshowDelay());
  }, true);
  document.addEventListener("fullscreenchange", () => scheduleRefresh(80), true);

  observer = new MutationObserver(() => scheduleRefresh(160));
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active", "data-fl-lightbox"] });
  scheduleRefresh(0);
  window.setTimeout(refresh, 600);
})();